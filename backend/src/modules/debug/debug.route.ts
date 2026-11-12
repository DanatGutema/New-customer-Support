import { Router, Request, Response } from "express";
import { getFeedbackByStaffId } from "./debug.controller";
import { ENV } from "../../config/env";

const router = Router();

// Development-only: fetch feedback for a staff id without auth to aid debugging
router.get("/feedback-by-staff/:staffId", getFeedbackByStaffId);

// Development-only: test SMTP connection and send a real email through the app stack
router.get("/test-email", async (req: Request, res: Response) => {
  try {
    const nodemailer = await import("nodemailer");
    const to = (req.query.to as string) || "test@example.com";

    // Show what env vars the running process sees
    const config = {
      SMTP_HOST: ENV.SMTP_HOST,
      SMTP_PORT: ENV.SMTP_PORT,
      SMTP_USER: ENV.SMTP_USER,
      SMTP_PASS: ENV.SMTP_PASS ? "***set***" : "MISSING",
      SMTP_FROM: ENV.SMTP_FROM,
    };

    if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) {
      return res.status(500).json({ ok: false, reason: "SMTP not configured", config });
    }

    const transporter = nodemailer.default.createTransport({
      host: ENV.SMTP_HOST,
      port: Number(ENV.SMTP_PORT),
      secure: Number(ENV.SMTP_PORT) === 465,
      auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: ENV.SMTP_FROM || `"MOTI Support" <${ENV.SMTP_USER}>`,
      to,
      subject: "[Debug] MOTI Support Email Test",
      text: "If you see this, the backend SMTP config is working correctly.",
      html: "<p>If you see this, the backend SMTP config is working correctly.</p>",
    });

    return res.json({
      ok: true,
      message: "Email sent successfully",
      messageId: info.messageId,
      accepted: info.accepted,
      config,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      config: {
        SMTP_HOST: ENV.SMTP_HOST,
        SMTP_PORT: ENV.SMTP_PORT,
        SMTP_USER: ENV.SMTP_USER,
        SMTP_PASS: ENV.SMTP_PASS ? "***set***" : "MISSING",
        SMTP_FROM: ENV.SMTP_FROM,
      },
    });
  }
});

export const DebugRouter = router;
