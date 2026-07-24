import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { loginAndWaitForHome } from "../support/auth";
import { API_URL } from "../support/config";
import {
  AGENT_EMAIL,
  AGENT_PASSWORD,
  INBOUND_EMAIL_WEBHOOK_SECRET,
} from "../support/env";

const WEBHOOK_URL = `${API_URL}/api/webhooks/inbound-email`;

type WebhookPayload = {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
};

/**
 * Builds a valid inbound-email payload with a random suffix, so concurrent
 * tests against the shared `helpdesk_test` DB never collide (mirrors
 * `createTestTicket` in `support/tickets.ts`).
 */
function validPayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  const unique = randomUUID().slice(0, 8);
  return {
    from: `sender-${unique}@example.com`,
    to: "support@example.com",
    subject: `Webhook Test ${unique}`,
    body: `Webhook test body ${unique}`,
    messageId: `webhook-test-${unique}`,
    ...overrides,
  };
}

test.describe("Inbound email webhook contract", () => {
  test("rejects requests with a missing x-webhook-secret header", async ({
    page,
  }) => {
    const response = await page.request.post(WEBHOOK_URL, {
      data: validPayload(),
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects requests with an incorrect x-webhook-secret header", async ({
    page,
  }) => {
    const response = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": "definitely-the-wrong-secret" },
      data: validPayload(),
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects a payload missing the subject", async ({ page }) => {
    const { subject: _subject, ...payload } = validPayload();

    const response = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: payload,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("rejects a payload with an invalid from email address", async ({
    page,
  }) => {
    const response = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: validPayload({ from: "not-an-email" }),
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("creates a ticket and returns 201 with the expected fields", async ({
    page,
  }) => {
    const payload = validPayload();

    const response = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: payload,
    });

    expect(response.status()).toBe(201);
    const ticket = await response.json();
    expect(ticket).toMatchObject({
      subject: payload.subject,
      body: payload.body,
      senderEmail: payload.from,
      sourceMessageId: payload.messageId,
      status: "open",
      category: null,
    });
    expect(typeof ticket.id).toBe("string");
    expect(ticket.id.length).toBeGreaterThan(0);
  });

  test("a duplicate messageId returns the existing ticket with 200 instead of creating a new one", async ({
    page,
  }) => {
    const payload = validPayload();

    const first = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: payload,
    });
    expect(first.status()).toBe(201);
    const firstTicket = await first.json();

    // Same messageId, different subject — the existing ticket should be
    // returned as-is rather than a second ticket being created or the
    // first one being updated.
    const second = await page.request.post(WEBHOOK_URL, {
      headers: { "x-webhook-secret": INBOUND_EMAIL_WEBHOOK_SECRET },
      data: { ...payload, subject: `${payload.subject} (duplicate)` },
    });
    expect(second.status()).toBe(200);
    const secondTicket = await second.json();
    expect(secondTicket.id).toBe(firstTicket.id);
    expect(secondTicket.subject).toBe(payload.subject);

    // Confirm no duplicate ticket was created: exactly one ticket carries
    // the original subject in the list.
    await loginAndWaitForHome(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.goto("/tickets");
    await expect(
      page.getByRole("row", { name: new RegExp(payload.subject) }),
    ).toHaveCount(1);
  });
});
