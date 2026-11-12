import nodemailer from "nodemailer";
import { ENV } from "../config/env";
import { prisma } from "../config/database";
import crypto from "crypto";

// ─── RFC 2822 Message-ID generator ───────────────────────────────────────────

export function generateMessageId(domain?: string): string {
  const d = domain || (ENV.SMTP_FROM?.split("@")[1]) || "motisupport.dev";
  return `<${Date.now()}.${crypto.randomBytes(8).toString("hex")}@${d}>`;
}

/**
 * Build a proper RFC 5322 References header.
 * The chain should contain ALL prior Message-IDs, oldest first.
 * We merge whatever was already in `existingReferences` with the new `inReplyTo`.
 */
export function buildReferences(
  existingReferences: string | null | undefined,
  inReplyTo: string | null | undefined,
): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  const add = (id: string | null | undefined) => {
    const v = id?.trim();
    if (v && !seen.has(v)) { seen.add(v); parts.push(v); }
  };

  // existing chain (space-separated list of message-ids)
  if (existingReferences) {
    existingReferences.trim().split(/\s+/).forEach(add);
  }
  add(inReplyTo);

  return parts.join(" ");
}

/**
 * Canonical subject for a case thread.
 * ALL emails for the same case use this subject (with "Re: " prefix for replies)
 * so Gmail / Outlook group them into one conversation.
 */
export function caseThreadSubject(caseNumber: string, subjectLine: string, isRoot = false): string {
  const base = `[Case #${caseNumber}] ${subjectLine}`;
  return isRoot ? base : `Re: ${base}`;
}

// ─── Shared interfaces ────────────────────────────────────────────────────────

interface StatusEmailInput {
  customerEmail: string;
  customerName: string;
  caseNumber: string;
  caseId?: string;
  subjectLine: string;
  newStatus: string;
}

interface CaseCreationEmailInput {
  customerEmail: string;
  customerName: string;
  caseNumber: string;
  caseId: string;          // Required — needed to log root Message-ID against the case
  subjectLine: string;
  description: string;
  isCreatedByStaff: boolean;
  creationReason?: string | null;
}

interface SharedInboxEmailInput {
  caseNumber: string;
  subjectLine: string;
  description: string;
  customerName: string;
  customerEmail: string;
  branchName: string;
  creatorName: string;
  creationReason?: string | null;
}

// ─── SMTP transporter ─────────────────────────────────────────────────────────

export const getTransporter = () =>
  nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: Number(ENV.SMTP_PORT),
    secure: Number(ENV.SMTP_PORT) === 465,
    auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });

// ─── Core dispatcher ──────────────────────────────────────────────────────────

interface DispatchOptions {
  to: string;
  subject: string;
  html: string;
  kind: string;
  bcc?: string[];
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  relatedCaseId?: string;
  bodyText?: string;
}

/**
 * Shared dispatcher for every email in the system.
 *
 * Threading contract (RFC 5322 / RFC 2822):
 *   • Every outbound email gets a unique Message-ID.
 *   • Reply emails set In-Reply-To = the DIRECT parent Message-ID.
 *   • References = full chain of all prior Message-IDs (oldest→newest).
 *   • Subject for case emails MUST be identical on all messages in the thread
 *     (use caseThreadSubject() everywhere — Gmail/Outlook thread by subject).
 *   • The root email's Message-ID is stored in EmailLog with the caseId so
 *     every follow-up can look it up and chain off it.
 */
export const dispatchEmail = async ({
  to,
  subject,
  html,
  kind,
  bcc,
  messageId,
  inReplyTo,
  references,
  relatedCaseId,
  bodyText,
}: DispatchOptions) => {
  if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) {
    const reason = `SMTP not configured (HOST=${ENV.SMTP_HOST || "unset"})`;
    console.error(`[Email:${kind}] ABORTED -> ${to} | ${reason}`);
    throw new Error(reason);
  }

  const outboundMessageId = messageId || generateMessageId();
  const refsChain = buildReferences(references, inReplyTo);

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: ENV.SMTP_FROM || `"MOTI Support System" <${ENV.SMTP_USER}>`,
    to,
    subject,
    html,
    // nodemailer uses 'messageId' (camelCase) to override the auto-generated one
    messageId: outboundMessageId,
    ...(inReplyTo  ? { inReplyTo }            : {}),
    ...(refsChain  ? { references: refsChain } : {}),
    ...(bcc?.length ? { bcc }                 : {}),
  });

  console.log(`[Email:${kind}] SENT -> ${to} | msgId=${outboundMessageId} inReplyTo=${inReplyTo ?? "none"}`);

  if (info.rejected?.length) {
    console.error(`[Email:${kind}] REJECTED -> ${JSON.stringify(info.rejected)}`);
  }

  // Persist threading metadata (non-blocking)
  prisma.emailLog.create({
    data: {
      recipientEmail: to,
      emailType: "CASE_STATUS_CHANGED" as any,
      relatedCaseId: relatedCaseId ?? null,
      status: "SENT",
      sentAt: new Date(),
      messageId: outboundMessageId,
      inReplyTo: inReplyTo ?? null,
      references: refsChain || null,
      subject,
      bodyText: bodyText ?? null,
      direction: "OUTBOUND",
      fromEmail: ENV.SMTP_FROM || ENV.SMTP_USER || null,
    },
  }).catch((e) => console.error(`[Email:${kind}] EmailLog save failed:`, e));

  return { ...info, outboundMessageId };
};

// ─── Thread-root lookup helper ────────────────────────────────────────────────

/**
 * Find the LATEST outbound email for this case sent to `recipientEmail`
 * (or the global case root if no recipient filter) and return threading headers.
 *
 * We reply to the LATEST message so the chain stays correct in all clients.
 */
async function getThreadHeaders(
  caseId: string,
  recipientEmail?: string,
): Promise<{ inReplyTo: string; references: string } | null> {
  try {
    // First: find the absolute root (oldest) for the References chain
    const root = await prisma.emailLog.findFirst({
      where: {
        relatedCaseId: caseId,
        direction: "OUTBOUND",
        messageId: { not: null },
        ...(recipientEmail ? { recipientEmail } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { messageId: true, references: true },
    });

    // Then: find the most recent for In-Reply-To (direct parent)
    const latest = await prisma.emailLog.findFirst({
      where: {
        relatedCaseId: caseId,
        direction: "OUTBOUND",
        messageId: { not: null },
        ...(recipientEmail ? { recipientEmail } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { messageId: true, references: true },
    });

    if (!root?.messageId || !latest?.messageId) return null;

    // Build a complete references chain: existing root chain + latest messageId
    const refs = buildReferences(
      buildReferences(root.references, root.messageId),
      latest.messageId,
    );

    return { inReplyTo: latest.messageId, references: refs };
  } catch {
    return null;
  }
}

// ─── Verification email ───────────────────────────────────────────────────────

export const sendVerificationEmail = async (
  toEmail: string,
  recipientName: string,
  rawTokenOrBaseUrl?: string,
  userTypeOrToken?: "CUSTOMER" | "STAFF" | string,
  maybeUserType?: "CUSTOMER" | "STAFF" | string,
): Promise<boolean> => {
  let rawToken = "";
  let userType: "CUSTOMER" | "STAFF" = "CUSTOMER";
  let baseUrl = ENV.FRONTEND_URL || "http://localhost:3000";

  if (
    typeof rawTokenOrBaseUrl === "string" &&
    /^https?:\/\//.test(rawTokenOrBaseUrl) &&
    typeof userTypeOrToken === "string" &&
    maybeUserType
  ) {
    baseUrl = rawTokenOrBaseUrl;
    rawToken = userTypeOrToken;
    userType = maybeUserType.toUpperCase() as "CUSTOMER" | "STAFF";
  } else if (
    typeof userTypeOrToken === "string" &&
    (userTypeOrToken.toUpperCase() === "CUSTOMER" || userTypeOrToken.toUpperCase() === "STAFF")
  ) {
    userType = userTypeOrToken.toUpperCase() as "CUSTOMER" | "STAFF";
    rawToken = typeof rawTokenOrBaseUrl === "string" ? rawTokenOrBaseUrl : "";
  } else {
    rawToken = typeof rawTokenOrBaseUrl === "string" ? rawTokenOrBaseUrl : "";
    userType =
      typeof maybeUserType === "string" &&
      (maybeUserType.toUpperCase() === "CUSTOMER" || maybeUserType.toUpperCase() === "STAFF")
        ? (maybeUserType.toUpperCase() as "CUSTOMER" | "STAFF")
        : "CUSTOMER";
  }

  const verificationUrl = `${baseUrl}/verify-email?token=${rawToken}&type=${userType.toLowerCase()}`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:16px;">Hello ${recipientName},</p>
      <p style="font-size:14px;">Thank you for registering. Click the button below to verify your email within 24 hours:</p>
      <table border="0" cellpadding="0" cellspacing="0" style="margin:30px 0;">
        <tr>
          <td align="center" bgcolor="#5182c4" style="border-radius:12px;">
            <a href="${verificationUrl}" target="_blank"
               style="font-size:14px;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 32px;display:inline-block;font-weight:bold;">
              Verify Email Address
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#64748b;">Or copy: <a href="${verificationUrl}" style="color:#5182c4;">${verificationUrl}</a></p>
    </div>`;

  try {
    await dispatchEmail({ to: toEmail, subject: "Verify Your MOTI Support Portal Account", html, kind: "verification" });
    return true;
  } catch (e) {
    console.error("[Email:verification]", e);
    return false;
  }
};

// ─── Case creation — ROOT of the thread ──────────────────────────────────────

export const sendCaseCreationCustomerEmail = async (
  input: CaseCreationEmailInput,
): Promise<boolean> => {
  const { customerEmail, customerName, caseNumber, caseId, subjectLine, description, isCreatedByStaff, creationReason } = input;

  // This is the THREAD ROOT. Use the canonical base subject (no "Re:" prefix).
  const subject = caseThreadSubject(caseNumber, subjectLine, true);

  const bodyGreeting = isCreatedByStaff
    ? `<p style="font-size:14px;">Our support team has opened a case on your behalf.</p>`
    : `<p style="font-size:14px;">Thanks for contacting us! Your request has been assigned ticket <b>#${caseNumber}</b>.</p>`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:16px;">Hello ${customerName},</p>
      ${bodyGreeting}
      <div style="background:#f8fafc;border-left:4px solid #5182c4;padding:12px 16px;margin:20px 0;">
        <p style="margin:0;font-size:14px;"><b>Case Number:</b> #${caseNumber}</p>
        <p style="margin:4px 0 0;font-size:14px;"><b>Subject:</b> ${subjectLine}</p>
        ${creationReason ? `<p style="margin:4px 0 0;font-size:14px;"><b>Reason:</b> ${creationReason}</p>` : ""}
      </div>
      <p style="font-size:14px;"><b>Description:</b></p>
      <p style="font-size:14px;color:#475569;">${description}</p>
      <p style="font-size:14px;margin-top:24px;">Our support team is reviewing your request and will follow up shortly.</p>
    </div>`;

  // Generate a stable root Message-ID for this case thread
  const rootMessageId = generateMessageId();

  try {
    await dispatchEmail({
      to: customerEmail,
      subject,
      html,
      kind: "case-created",
      messageId: rootMessageId,
      relatedCaseId: caseId,          // ← critical: link root email to the case
      bodyText: `Case #${caseNumber}: ${subjectLine}\n\n${description}`,
    });
    return true;
  } catch (e) {
    console.error("[Email:case-created]", e);
    return false;
  }
};

// ─── Status update email (customer) ──────────────────────────────────────────

export const sendStatusUpdateEmail = async (input: StatusEmailInput) => {
  const { customerEmail, customerName, caseNumber, caseId, subjectLine, newStatus } = input;

  const FRONTEND = ENV.FRONTEND_URL || "http://localhost:5173";
  const decisionLink  = caseId ? `${FRONTEND}/cases/${caseId}/feedback` : `${FRONTEND}/track/${caseNumber}`;
  const rejectLink    = caseId ? `${FRONTEND}/cases/${caseId}/reopen`   : `${FRONTEND}/track/${caseNumber}`;
  const trackingUrl   = `${FRONTEND}/track/${caseNumber}`;
  const isResolved    = newStatus === "RESOLVED";

  // Thread under existing case emails to this customer
  const thread = caseId ? await getThreadHeaders(caseId, customerEmail) : null;

  // Use the canonical Re: subject — same base as the creation email
  const subject = subjectLine
    ? caseThreadSubject(caseNumber, subjectLine)
    : `Re: [Case #${caseNumber}] Status Update`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
      <h2 style="color:#2c3e50;">Case Update: #${caseNumber}</h2>
      <p>Hello ${customerName},</p>
      <p>Your support ticket <strong>"${subjectLine}"</strong> has been updated.</p>
      <div style="background:#f8f9fa;padding:15px;border-left:4px solid #3498db;margin:20px 0;border-radius:4px;">
        <strong>New Status:</strong> <span style="color:#2980b9;font-weight:bold;">${newStatus}</span>
      </div>
      ${isResolved ? `
        <p>Please confirm whether this resolution is acceptable:</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${decisionLink}" style="background:#38a169;color:white;padding:12px 20px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;margin-right:10px;margin-bottom:10px;">ACCEPT</a>
          <a href="${rejectLink}"   style="background:#e53e3e;color:white;padding:12px 20px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;margin-bottom:10px;">REJECT</a>
        </div>
      ` : `
        <p>Track your case progress:</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${trackingUrl}" style="background:#3498db;color:white;padding:12px 25px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;">Track Case Progress</a>
        </div>
      `}
    </div>`;

  try {
    await dispatchEmail({
      to: customerEmail,
      subject,
      html,
      kind: `status-${newStatus}`,
      inReplyTo:    thread?.inReplyTo,
      references:   thread?.references,
      relatedCaseId: caseId,
      bodyText: `Case #${caseNumber} status changed to ${newStatus}.`,
    });
  } catch (e) {
    console.error(`[Email:status] Failed for ${customerEmail}:`, e);
  }
};

// ─── Resolution email (customer) ─────────────────────────────────────────────

export const triggerResolutionEmail = async (caseReport: any): Promise<void> => {
  const customerEmail = caseReport.customer?.email;
  const customerName  = caseReport.customer?.firstName || "Valued Customer";
  if (!customerEmail) return;

  const FRONTEND = ENV.FRONTEND_URL || "http://localhost:3000";
  const acceptLink = `${FRONTEND}/cases/${caseReport.id}/feedback`;
  const rejectLink = `${FRONTEND}/cases/${caseReport.id}/reopen`;

  const thread = caseReport.id
    ? await getThreadHeaders(caseReport.id, customerEmail)
    : null;

  // Same canonical subject as creation email, with Re: prefix
  const subject = caseReport.subject
    ? caseThreadSubject(caseReport.caseNumber, caseReport.subject)
    : `Re: [Case #${caseReport.caseNumber ?? ""}] Resolution`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="color:#2b6cb0;margin-bottom:16px;">Your Case Has Been Resolved</h2>
      <p>Hello ${customerName},</p>
      <p>An agent has submitted a resolution summary for your review.</p>
      <div style="background:#f7fafc;border-left:4px solid #4299e1;padding:16px;margin:20px 0;border-radius:0 4px 4px 0;">
        <strong style="display:block;margin-bottom:6px;color:#2d3748;">Resolution Summary:</strong>
        <p style="margin:0;color:#4a5568;font-style:italic;white-space:pre-wrap;">"${caseReport.resolutionSummary}"</p>
      </div>
      <p>Please confirm if this issue is settled to your satisfaction:</p>
      <div style="margin-bottom:24px;">
        <a href="${acceptLink}" style="background:#38a169;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;margin-right:12px;margin-bottom:12px;">ACCEPT</a>
        <a href="${rejectLink}" style="background:#e53e3e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;margin-bottom:12px;">REJECT</a>
      </div>
      <p style="font-size:12px;color:#718096;">If you do not respond within <strong>3 days</strong>, the case will be automatically closed.</p>
    </div>`;

  await dispatchEmail({
    to: customerEmail,
    subject,
    html,
    kind: "resolved",
    inReplyTo:    thread?.inReplyTo,
    references:   thread?.references,
    relatedCaseId: caseReport.id,
    bodyText: `Case #${caseReport.caseNumber} resolved. Summary: ${caseReport.resolutionSummary}`,
  });
};

// ─── Resolution reminder (customer) ──────────────────────────────────────────

export const triggerResolutionReminderEmail = async (caseReport: any): Promise<void> => {
  const customerEmail = caseReport.customer?.email;
  const customerName  = caseReport.customer?.firstName || "Valued Customer";
  if (!customerEmail) return;

  const FRONTEND = ENV.FRONTEND_URL || "http://localhost:3000";
  const acceptLink = `${FRONTEND}/cases/${caseReport.id}/feedback`;
  const rejectLink = `${FRONTEND}/cases/${caseReport.id}/reopen`;

  const thread = caseReport.id ? await getThreadHeaders(caseReport.id, customerEmail) : null;

  const subject = caseReport.subject
    ? caseThreadSubject(caseReport.caseNumber, caseReport.subject)
    : `Re: [Case #${caseReport.caseNumber ?? ""}] Reminder`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="color:#2b6cb0;margin-bottom:16px;">Reminder: Please Confirm the Resolution</h2>
      <p>Hello ${customerName},</p>
      <p>We resolved your case regarding <strong>"${caseReport.subject}"</strong> and are still waiting for your response.</p>
      <div style="margin:24px 0;">
        <a href="${acceptLink}" style="background:#38a169;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;margin-right:12px;margin-bottom:12px;">ACCEPT</a>
        <a href="${rejectLink}" style="background:#e53e3e;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;margin-bottom:12px;">REJECT</a>
      </div>
      <p style="font-size:12px;color:#718096;">If you do not respond, the system will automatically close the case.</p>
    </div>`;

  await dispatchEmail({
    to: customerEmail,
    subject,
    html,
    kind: "resolution-reminder",
    inReplyTo:    thread?.inReplyTo,
    references:   thread?.references,
    relatedCaseId: caseReport.id,
    bodyText: `Reminder: Please confirm resolution for case #${caseReport.caseNumber}.`,
  });
};

// ─── Auto-close email (customer) ─────────────────────────────────────────────

export const triggerAutoCloseEmail = async (caseReport: any): Promise<void> => {
  const customerEmail = caseReport.customer?.email;
  const customerName  = caseReport.customer?.firstName || "Valued Customer";
  if (!customerEmail) return;

  const thread = caseReport.id ? await getThreadHeaders(caseReport.id, customerEmail) : null;

  const subject = caseReport.subject
    ? caseThreadSubject(caseReport.caseNumber, caseReport.subject)
    : `Re: [Case #${caseReport.caseNumber ?? ""}] Closed`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="color:#4a5568;margin-bottom:16px;">Case Closed Due to Inactivity</h2>
      <p>Hello ${customerName},</p>
      <p>We resolved your case regarding <strong>"${caseReport.subject}"</strong>, but we did not receive your response, so the case has been closed.</p>
      <div style="background:#fffaf0;border-left:4px solid #dd6b20;padding:16px;margin:20px 0;border-radius:0 4px 4px 0;">
        <p style="margin:0;color:#dd6b20;font-weight:bold;">Need to continue working on this issue?</p>
        <p style="margin:4px 0 0;color:#7b341e;">Please open a new support case from your dashboard.</p>
      </div>
      <p style="font-size:12px;color:#a0aec0;text-align:center;">Thank you for choosing our services.</p>
    </div>`;

  await dispatchEmail({
    to: customerEmail,
    subject,
    html,
    kind: "auto-close",
    inReplyTo:    thread?.inReplyTo,
    references:   thread?.references,
    relatedCaseId: caseReport.id,
    bodyText: `Case #${caseReport.caseNumber} has been automatically closed.`,
  });
};

// ─── Case assignment emails ───────────────────────────────────────────────────

interface CaseAssignmentEmailInput {
  agentEmail: string;
  agentName: string;
  caseNumber: string;
  caseId?: string;
  subjectLine?: string;
}

interface CustomerAssignmentEmailInput {
  customerEmail: string;
  customerName: string;
  caseNumber: string;
  caseId?: string;
  subjectLine?: string;
}

export const sendCaseAssignmentEmail = async (
  input: CaseAssignmentEmailInput,
): Promise<boolean> => {
  const { agentEmail, agentName, caseNumber, caseId, subjectLine } = input;
  const baseUrl  = ENV.FRONTEND_URL || "http://localhost:3000";
  const caseUrl  = `${baseUrl}/support/case/${caseId ?? caseNumber}`;

  const thread = caseId ? await getThreadHeaders(caseId, agentEmail) : null;

  // Agents get a subject based on the same canonical pattern
  const subject = subjectLine
    ? caseThreadSubject(caseNumber, subjectLine)
    : `Re: [Case #${caseNumber}] New Assignment`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:16px;">Hello ${agentName},</p>
      <p style="font-size:14px;">You have been assigned to handle support ticket <strong>#${caseNumber}</strong>${subjectLine ? `: "${subjectLine}"` : ""}.</p>
      <table border="0" cellpadding="0" cellspacing="0" style="margin:25px 0;">
        <tr>
          <td align="center" bgcolor="#5182c4" style="border-radius:8px;">
            <a href="${caseUrl}" target="_blank"
               style="font-size:14px;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 24px;display:inline-block;font-weight:bold;">
              View Case
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#64748b;">Please log in to your staff portal to manage this case.</p>
    </div>`;

  try {
    await dispatchEmail({
      to: agentEmail,
      subject,
      html,
      kind: "agent-assigned",
      inReplyTo:    thread?.inReplyTo,
      references:   thread?.references,
      relatedCaseId: caseId,
      bodyText: `You have been assigned to Case #${caseNumber}${subjectLine ? `: ${subjectLine}` : ""}.`,
    });
    return true;
  } catch (e) {
    console.error(`[Email:agent-assigned] Failed for ${agentEmail}:`, e);
    return false;
  }
};

export const sendCustomerAssignmentEmail = async (
  input: CustomerAssignmentEmailInput,
): Promise<boolean> => {
  const { customerEmail, customerName, caseNumber, caseId, subjectLine } = input;
  const baseUrl     = ENV.FRONTEND_URL || "http://localhost:3000";
  const trackingUrl = `${baseUrl}/track/${caseNumber}`;

  const thread = caseId ? await getThreadHeaders(caseId, customerEmail) : null;

  const subject = subjectLine
    ? caseThreadSubject(caseNumber, subjectLine)
    : `Re: [Case #${caseNumber}] Agent Assigned`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:16px;">Hello ${customerName},</p>
      <p style="font-size:14px;">Your support request <strong>#${caseNumber}</strong> has been assigned to an agent and is now in progress.</p>
      <div style="text-align:center;margin:25px 0;">
        <a href="${trackingUrl}" style="background:#5182c4;color:white;padding:10px 24px;text-decoration:none;font-weight:bold;border-radius:8px;display:inline-block;">
          Track Progress
        </a>
      </div>
    </div>`;

  try {
    await dispatchEmail({
      to: customerEmail,
      subject,
      html,
      kind: "customer-assigned",
      inReplyTo:    thread?.inReplyTo,
      references:   thread?.references,
      relatedCaseId: caseId,
      bodyText: `Case #${caseNumber} has been assigned to a support agent.`,
    });
    return true;
  } catch (e) {
    console.error(`[Email:customer-assigned] Failed for ${customerEmail}:`, e);
    return false;
  }
};

// ─── Shared support inbox alert ───────────────────────────────────────────────

export const sendSharedSupportInboxAlert = async (
  input: SharedInboxEmailInput,
): Promise<boolean> => {
  const { caseNumber, subjectLine, description, customerName, customerEmail, branchName, creatorName, creationReason } = input;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1e293b;margin-bottom:8px;">New Case Alert</h2>
      <p style="font-size:14px;color:#64748b;">A new support case is awaiting assignment.</p>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:16px 0;" />
      <ul style="padding-left:20px;font-size:14px;">
        <li><b>Case Number:</b> #${caseNumber}</li>
        <li><b>Logged By:</b> ${creatorName}</li>
        <li><b>Customer:</b> ${customerName} (${customerEmail})</li>
        <li><b>Branch:</b> ${branchName}</li>
        <li><b>Subject:</b> ${subjectLine}</li>
        ${creationReason ? `<li><b>Reason:</b> ${creationReason}</li>` : ""}
      </ul>
      <h4 style="margin-bottom:8px;">Description:</h4>
      <p style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:14px;">${description}</p>
    </div>`;

  try {
    await dispatchEmail({
      to: ENV.SHARED_SUPPORT_INBOX || "",
      subject: `[New Case #${caseNumber}] ${subjectLine}`,
      html,
      kind: "shared-inbox",
    });
    return true;
  } catch (e) {
    console.error("[Email:shared-inbox]", e);
    return false;
  }
};

// ─── Password reset ───────────────────────────────────────────────────────────

export const sendPasswordResetEmail = async (
  toEmail: string,
  fullName: string,
  rawToken: string,
  userType: "CUSTOMER" | "STAFF",
): Promise<boolean> => {
  const baseUrl  = ENV.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&type=${userType.toLowerCase()}`;

  const html = `
    <div style="font-family:sans-serif;color:#334155;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:16px;">Hello ${fullName},</p>
      <p style="font-size:14px;">We received a request to reset your password. Click below (expires in 15 minutes):</p>
      <table border="0" cellpadding="0" cellspacing="0" style="margin:30px 0;">
        <tr>
          <td align="center" bgcolor="#5182c4" style="border-radius:12px;">
            <a href="${resetUrl}" target="_blank"
               style="font-size:14px;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 32px;display:inline-block;font-weight:bold;">
              Reset Password
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#64748b;">Or copy: <a href="${resetUrl}" style="color:#5182c4;">${resetUrl}</a></p>
    </div>`;

  try {
    await dispatchEmail({ to: toEmail, subject: "Reset Your MOTI Support Portal Password", html, kind: "password-reset" });
    return true;
  } catch (e) {
    console.error("[Email:password-reset]", e);
    return false;
  }
};

// ─── Account approval ─────────────────────────────────────────────────────────

export const sendAccountApprovalEmail = async (
  to: string,
  fullName: string,
  frontendUrl: string,
  userType: "STAFF" | "CUSTOMER",
): Promise<boolean> => {
  try {
    const loginUrl = `${frontendUrl}/login`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;">
        <h2 style="color:#2563eb;">Account Approved!</h2>
        <p>Hello <strong>${fullName}</strong>,</p>
        <p>Your <strong>${userType}</strong> account has been approved. You can now log in.</p>
        <div style="margin:25px 0;">
          <a href="${loginUrl}"
             style="background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
            Log In to Your Account
          </a>
        </div>
        <p style="font-size:13px;color:#666;margin-top:30px;border-top:1px solid #eee;padding-top:10px;">
          If you did not request this account, please contact support immediately.
        </p>
      </div>`;

    await dispatchEmail({ to, subject: "Your Account Has Been Approved!", html, kind: "account-approved" });
    return true;
  } catch (e) {
    console.error(`[Email:account-approved] Failed for ${to}:`, e);
    return false;
  }
};

// ─── Staff case update email ──────────────────────────────────────────────────

interface StaffCaseUpdateEmailInput {
  staffEmail: string;
  staffName: string;
  caseNumber: string;
  caseId: string;
  subjectLine: string;
  updateType: "status_change" | "resolution" | "closure" | "reassignment" | "priority_change" | "escalation" | "note_added";
  newStatus?: string;
  previousStatus?: string;
  updatedBy: string;
  updateDetails?: string;
  caseUrl: string;
}

export const sendStaffCaseUpdateEmail = async (
  input: StaffCaseUpdateEmailInput,
): Promise<boolean> => {
  const {
    staffEmail, staffName, caseNumber, caseId, subjectLine,
    updateType, newStatus, previousStatus, updatedBy, updateDetails, caseUrl,
  } = input;

  const labels: Record<string, string> = {
    status_change:   "Status Updated",
    resolution:      "Case Resolved",
    closure:         "Case Closed",
    reassignment:    "Case Reassigned",
    priority_change: "Priority Changed",
    escalation:      "Case Escalated",
    note_added:      "Note Added",
  };
  const label = labels[updateType] || "Case Updated";

  const statusColors: Record<string, string> = {
    OPEN: "#3498db", IN_PROGRESS: "#f39c12", PENDING: "#9b59b6",
    ESCALATED: "#e74c3c", RESOLVED: "#27ae60", CLOSED: "#2c3e50", CANCELLED: "#95a5a6",
  };
  const color = newStatus ? (statusColors[newStatus] || "#3498db") : "#3498db";

  const statusHtml = newStatus ? `
    <div style="background:#f8f9fa;padding:15px;border-left:4px solid ${color};margin:20px 0;border-radius:4px;">
      <strong>Status:</strong>
      <span style="color:${color};font-weight:bold;margin-left:8px;">${previousStatus ? `${previousStatus} → ` : ""}${newStatus}</span>
    </div>` : "";

  const detailsHtml = updateDetails ? `
    <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;">
      <strong>Details:</strong>
      <p style="margin:8px 0 0;font-style:italic;color:#856404;">${updateDetails}</p>
    </div>` : "";

  // Thread under existing staff emails for this case
  const thread = await getThreadHeaders(caseId, staffEmail);

  // Staff emails also use the canonical subject pattern
  const subject = caseThreadSubject(caseNumber, subjectLine);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
      <h2 style="color:#2c3e50;">${label}: Case #${caseNumber}</h2>
      <p>Hello ${staffName},</p>
      <p>An update has been made to <strong>"${subjectLine}"</strong> (Case #${caseNumber}).</p>
      ${statusHtml}
      ${detailsHtml}
      <div style="text-align:center;margin:30px 0;">
        <a href="${caseUrl}" style="background:#3498db;color:white;padding:12px 25px;text-decoration:none;font-weight:bold;border-radius:4px;display:inline-block;">View Case</a>
      </div>
      <p style="font-size:12px;color:#7f8c8d;">Updated by: ${updatedBy}</p>
    </div>`;

  try {
    await dispatchEmail({
      to: staffEmail,
      subject,
      html,
      kind: `staff-${updateType}`,
      inReplyTo:    thread?.inReplyTo,
      references:   thread?.references,
      relatedCaseId: caseId,
      bodyText: `Case #${caseNumber} ${label}${updateDetails ? `: ${updateDetails}` : ""}.`,
    });
    return true;
  } catch (e) {
    console.error(`[Email:staff-${updateType}] Failed for ${staffEmail}:`, e);
    return false;
  }
};
