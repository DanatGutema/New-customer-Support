/**
 * Inbound Email Webhook Handler
 *
 * Receives parsed inbound emails from an email provider
 * (SendGrid Inbound Parse, Mailgun Routes, Postmark Inbound, etc.)
 * and links them to the correct case as a CaseMessage.
 *
 * Provider setup instructions are in the README section below.
 *
 * To use with SendGrid Inbound Parse:
 *   - Set the inbound webhook URL to: POST /api/cases/inbound-email
 *   - SendGrid posts multipart/form-data with fields: from, to, subject, text, html, headers
 *
 * To use with Mailgun:
 *   - Set a route action: forward("https://yourdomain.com/api/cases/inbound-email")
 *   - Mailgun posts similar fields
 *
 * To use with Postmark:
 *   - Set the inbound webhook URL in your Postmark server settings
 *   - Postmark posts JSON with From, Subject, TextBody, Headers array
 */

import { Request, Response } from "express";
import { prisma } from "../../config/database";
import { MessageVisibility } from "../../../generated/prisma/client";

// ─── Parse Message-ID from raw headers ───────────────────────────────────────

function extractHeader(headers: string, name: string): string | null {
  const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = headers?.match(regex);
  return match ? match[1].trim() : null;
}

function parseHeadersArray(headersArr: { Name: string; Value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(headersArr)) return map;
  for (const h of headersArr) {
    if (h?.Name && h?.Value) map[h.Name.toLowerCase()] = h.Value;
  }
  return map;
}

// ─── Extract case number from subject ────────────────────────────────────────
// Subjects look like: "[Case #MOTI-10000-M0C001] ..." or "Re: [Case #MOTI-10000-M0C001]"

function extractCaseNumber(subject: string): string | null {
  const match = subject?.match(/\bMOTI-\d+-M0C\d+\b/i);
  return match ? match[0].toUpperCase() : null;
}

// ─── Normalize email address ──────────────────────────────────────────────────

function extractEmail(value: string): string {
  const match = value?.match(/<([^>]+)>/);
  return (match ? match[1] : value)?.trim().toLowerCase();
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

export const handleInboundEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    // Support both multipart/form-data (SendGrid/Mailgun) and JSON (Postmark)
    const body = req.body || {};

    // ── Extract fields (normalize across providers) ──────────────────────────
    let fromRaw: string = body.from || body.From || "";
    let subject: string = body.subject || body.Subject || "";
    let textBody: string = body.text || body.TextBody || body["body-plain"] || "";
    let headersRaw: string = body.headers || body.Headers || "";

    // Postmark sends headers as an array
    let parsedHeaders: Record<string, string> = {};
    if (Array.isArray(body.Headers)) {
      parsedHeaders = parseHeadersArray(body.Headers);
    }

    // ── Extract threading headers ────────────────────────────────────────────
    const messageId =
      extractHeader(headersRaw, "Message-ID") ||
      parsedHeaders["message-id"] ||
      body["Message-Id"] ||
      null;

    const inReplyTo =
      extractHeader(headersRaw, "In-Reply-To") ||
      parsedHeaders["in-reply-to"] ||
      null;

    const references =
      extractHeader(headersRaw, "References") ||
      parsedHeaders["references"] ||
      null;

    const fromEmail = extractEmail(fromRaw);

    if (!fromEmail) {
      res.status(400).json({ error: "Missing sender address." });
      return;
    }

    // ── Duplicate check by Message-ID ────────────────────────────────────────
    if (messageId) {
      const existing = await prisma.emailLog.findUnique({
        where: { messageId },
        select: { id: true },
      });
      if (existing) {
        console.log(`[InboundEmail] Duplicate message ignored: ${messageId}`);
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
    }

    // ── Find associated case ──────────────────────────────────────────────────
    // Strategy 1: extract case number from subject
    const caseNumber = extractCaseNumber(subject);
    let caseRecord: { id: string; customerId: string } | null = null;

    if (caseNumber) {
      caseRecord = await prisma.caseReport.findUnique({
        where: { caseNumber },
        select: { id: true, customerId: true },
      });
    }

    // Strategy 2: look up the In-Reply-To message in EmailLog → find relatedCaseId
    if (!caseRecord && inReplyTo) {
      const parentLog = await prisma.emailLog.findFirst({
        where: { messageId: inReplyTo },
        select: { relatedCaseId: true },
      });
      if (parentLog?.relatedCaseId) {
        caseRecord = await prisma.caseReport.findUnique({
          where: { id: parentLog.relatedCaseId },
          select: { id: true, customerId: true },
        });
      }
    }

    // Strategy 3: walk the References chain
    if (!caseRecord && references) {
      const refIds = references.split(/\s+/).filter(Boolean);
      for (const ref of refIds.reverse()) {
        const refLog = await prisma.emailLog.findFirst({
          where: { messageId: ref },
          select: { relatedCaseId: true },
        });
        if (refLog?.relatedCaseId) {
          caseRecord = await prisma.caseReport.findUnique({
            where: { id: refLog.relatedCaseId },
            select: { id: true, customerId: true },
          });
          if (caseRecord) break;
        }
      }
    }

    if (!caseRecord) {
      console.warn(`[InboundEmail] Could not associate email to a case. Subject: "${subject}" From: ${fromEmail}`);
      // Log the unmatched inbound email so we can manually review it
      await prisma.emailLog.create({
        data: {
          recipientEmail: fromEmail,
          emailType: "CASE_STATUS_CHANGED" as any,
          status: "FAILED",
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || null,
          references: references || null,
          subject,
          bodyText: textBody.slice(0, 2000) || null,
          direction: "INBOUND",
          fromEmail,
        },
      }).catch(() => {});
      res.status(200).json({ ok: true, matched: false });
      return;
    }

    // ── Find the author (customer or staff) ───────────────────────────────────
    const customer = await prisma.customer.findFirst({
      where: { email: fromEmail, status: "ACTIVE" },
      select: { id: true },
    });

    const staff = customer ? null : await prisma.staff.findFirst({
      where: { email: fromEmail, status: "ACTIVE" },
      select: { id: true },
    });

    // Build cleaned message body (strip quoted reply text after first "---" or "On ... wrote:")
    const cleanBody = textBody
      .split(/\n--+\n|\nOn .+ wrote:/)[0]
      .trim()
      .slice(0, 4000);

    if (!cleanBody) {
      res.status(200).json({ ok: true, skipped: "empty body" });
      return;
    }

    // ── Create a CaseMessage from the inbound email ───────────────────────────
    await prisma.$transaction(async (tx) => {
      await tx.caseMessage.create({
        data: {
          caseReportId: caseRecord!.id,
          body: cleanBody,
          visibility: MessageVisibility.PUBLIC,
          authorCustomerId: customer?.id || null,
          authorStaffId: staff?.id || null,
        },
      });

      // Log the inbound email
      await tx.emailLog.create({
        data: {
          recipientEmail: fromEmail,
          emailType: "CASE_STATUS_CHANGED" as any,
          relatedCaseId: caseRecord!.id,
          status: "SENT",
          sentAt: new Date(),
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || null,
          references: references || null,
          subject,
          bodyText: cleanBody,
          direction: "INBOUND",
          fromEmail,
        },
      });
    });

    console.log(`[InboundEmail] Linked to case ${caseRecord.id} from ${fromEmail}`);
    res.status(200).json({ ok: true, matched: true, caseId: caseRecord.id });

  } catch (err: any) {
    console.error("[InboundEmail] Webhook error:", err);
    // Always return 200 to prevent provider retries
    res.status(200).json({ ok: false, error: err.message });
  }
};
