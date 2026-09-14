import { Resend } from "resend";

// The Resend API key comes entirely from the environment, so no credentials are
// ever committed. When RESEND_API_KEY is unset the mailer is disabled and every
// send becomes a no-op, so the app runs unchanged with no email configured — the
// same way the AI features degrade when GEMINI_API_KEY isn't set.
const apiKey = process.env.RESEND_API_KEY;
// The From header on outbound mail. Defaults to a support-style address so local
// testing works without any extra configuration.
const from = process.env.MAIL_FROM ?? "Helpdesk Support <support@helpdesk.local>";

/** Whether outbound email is configured (RESEND_API_KEY is set). When false, sends no-op. */
export function isEmailEnabled(): boolean {
  return Boolean(apiKey);
}

// Created once and reused across sends. Built lazily on the first real send so an
// unconfigured app never constructs a client or touches the network.
let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
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
 * Sends one email through the configured Resend account. A no-op when email is
 * not configured (RESEND_API_KEY unset), so callers can invoke it
 * unconditionally. Rejects if the send itself fails — the caller decides
 * whether that should surface.
 */
export async function sendEmail(email: OutboundEmail): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }

  const { data, error } = await getClient().emails.send({
    from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    // Threading via custom headers: References mirrors In-Reply-To so it works
    // across mail clients.
    ...(email.inReplyTo
      ? { headers: { "In-Reply-To": email.inReplyTo, References: email.inReplyTo } }
      : {}),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
  }

  console.log(`Resend email sent to ${email.to} (id: ${data.id})`);
}
