import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// SMTP connection details come entirely from the environment, so no credentials
// are ever committed. For local development these point at Mailpit — a zero-setup
// SMTP server (host localhost, port 1025, no auth) whose web inbox at
// http://localhost:8025 shows every message the app sends. In production the same
// vars point at a real SMTP relay instead.
//
// When SMTP_HOST is unset the mailer is disabled and every send becomes a no-op,
// so the app runs unchanged with no email configured — the same way the AI
// features degrade when GEMINI_API_KEY isn't set.
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 1025);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
// Implicit TLS (port 465). Mailpit speaks plain SMTP on 1025, so this stays
// false locally; set SMTP_SECURE=true only for a relay that requires it.
const secure = process.env.SMTP_SECURE === "true";
// The From header on outbound mail. Defaults to a support-style address so local
// Mailpit testing works without any extra configuration.
const from = process.env.MAIL_FROM ?? "Helpdesk Support <support@helpdesk.local>";

/** Whether outbound email is configured (SMTP_HOST is set). When false, sends no-op. */
export function isEmailEnabled(): boolean {
  return Boolean(host);
}

// Created once and reused across sends. Built lazily on the first real send so an
// unconfigured app never constructs a transport or touches the network.
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      // Only pass auth when both are set — Mailpit accepts unauthenticated mail,
      // and handing it empty credentials makes some servers reject the session.
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }
  return transporter;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  /**
   * Message-ID of the email being replied to, when captured. Threads the reply
   * under the customer's original message in their mail client. Omitted (or null)
   * for tickets ingested without a source Message-ID.
   */
  inReplyTo?: string | null;
}

/**
 * Sends one email through the configured SMTP server. A no-op when email is not
 * configured (SMTP_HOST unset), so callers can invoke it unconditionally. Rejects
 * if the send itself fails — the caller decides whether that should surface.
 */
export async function sendEmail(email: OutboundEmail): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }

  await getTransporter().sendMail({
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    // References mirrors inReplyTo so threading works across mail clients.
    ...(email.inReplyTo
      ? { inReplyTo: email.inReplyTo, references: email.inReplyTo }
      : {}),
  });
}
