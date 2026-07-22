import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { API_URL } from "./config";
import { INBOUND_EMAIL_WEBHOOK_SECRET } from "./env";

export type TestTicket = {
  id: string;
  subject: string;
  senderEmail: string;
  body: string;
  status: string;
  category: string | null;
};

/**
 * Creates a fresh ticket via the inbound email webhook
 * (`POST /api/webhooks/inbound-email`), the same entry point real inbound
 * emails use. Not tied to any page session — the webhook is authenticated
 * via the `x-webhook-secret` header, not a logged-in user — but takes a
 * `Page` so it can reuse the page's `request` context like the other
 * `support/` helpers. The random suffix keeps the subject/sender/messageId
 * unique across concurrent test runs against the shared `helpdesk_test` DB.
 */
export async function createTestTicket(
  page: Page,
  overrides: Partial<{
    subject: string;
    from: string;
    body: string;
    messageId: string;
  }> = {},
): Promise<TestTicket> {
  const unique = randomUUID().slice(0, 8);
  const subject = overrides.subject ?? `Test Ticket ${unique}`;
  const from = overrides.from ?? `sender-${unique}@example.com`;
  const body = overrides.body ?? `Test ticket body ${unique}`;
  const messageId = overrides.messageId ?? `test-message-${unique}`;

  const response = await page.request.post(
    `${API_URL}/api/webhooks/inbound-email`,
    {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: { from, to: "support@example.com", subject, body, messageId },
    },
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to create test ticket via webhook: ${response.status()} ${await response.text()}`,
    );
  }

  const created = await response.json();
  return {
    id: created.id,
    subject,
    senderEmail: from,
    body,
    status: created.status,
    category: created.category,
  };
}
