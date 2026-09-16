import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Same mocking strategy as `tickets.test.ts`: stub Prisma and Better Auth so
// these are true unit tests of the route contract, with no DB and no network.
vi.mock("../db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    ticket: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    reply: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../auth", () => ({ auth: { handler: vi.fn() } }));

vi.mock("../middleware/require-auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "test-user" };
    next();
  },
}));

vi.mock("../generated/client/client", () => ({ Prisma: {} }));

// The webhook only *enqueues* AI work now — the actual model calls live in the
// queue workers (tested separately). Stub both enqueues so these route tests
// never touch a real queue or database, and assert the webhook hands the jobs off.
vi.mock("../queue", () => ({
  enqueueTicketClassification: vi.fn(),
  enqueueTicketAutoResolve: vi.fn(),
}));

// The route verifies Resend's Svix-signed webhook and fetches email content
// through the Resend SDK — both stubbed so these tests never touch the
// network or need a real signature. Declared via `vi.hoisted` so the mock
// functions are reachable both inside the (hoisted) `vi.mock` factory and
// from the test bodies below.
const { mockVerify, mockReceivingGet } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockReceivingGet: vi.fn(),
}));

vi.mock("resend", () => ({
  // `new Resend(...)` requires a constructable mock implementation — an arrow
  // function here would make `new` throw ("is not a constructor"), so this
  // must be a regular `function`.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return {
      webhooks: { verify: mockVerify },
      emails: { receiving: { get: mockReceivingGet } },
    };
  }),
}));

process.env.RESEND_WEBHOOK_SECRET = "test-resend-webhook-secret";
process.env.RESEND_API_KEY = "test-resend-api-key";

import { app } from "../app";
import { prisma } from "../db";
import { enqueueTicketAutoResolve, enqueueTicketClassification } from "../queue";

const mockPrisma = vi.mocked(prisma, true);
const mockEnqueue = vi.mocked(enqueueTicketClassification);
const mockEnqueueAutoResolve = vi.mocked(enqueueTicketAutoResolve);

// A valid set of Svix headers. Their values don't matter — `webhooks.verify`
// is mocked — but the route requires all three to be present before it will
// even attempt verification.
const SVIX_HEADERS = {
  "svix-id": "msg_test",
  "svix-timestamp": "1700000000",
  "svix-signature": "v1,test-signature",
};

// What Resend's `email.received` webhook carries: metadata only, no body.
const resendEvent = {
  type: "email.received" as const,
  created_at: "2024-01-15T00:00:00.000Z",
  data: {
    email_id: "email-1",
    created_at: "2024-01-15T00:00:00.000Z",
    from: "customer@example.com",
    to: ["support@example.com"],
    bcc: [] as string[],
    cc: [] as string[],
    received_for: ["support@example.com"],
    message_id: "message-1",
    subject: "Can't log in",
    attachments: [] as unknown[],
  },
};

// What the Receiving API returns for that email_id — this is where the
// actual text/html body comes from.
const receivedEmailContent = {
  text: "I forgot my password.",
  html: null as string | null,
};

const created = {
  id: "ticket-1",
  subject: resendEvent.data.subject,
  body: receivedEmailContent.text,
  bodyHtml: null as string | null,
  senderEmail: resendEvent.data.from,
  senderName: null as string | null,
  status: "open",
  category: null,
  assignedTo: null,
  sourceMessageId: resendEvent.data.message_id,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  updatedAt: new Date("2024-01-15T00:00:00.000Z"),
};

function postInboundEmail(event: unknown = resendEvent, headers: Record<string, string> = SVIX_HEADERS) {
  return request(app).post("/api/webhooks/inbound-email").set(headers).send(event as object);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockReset().mockReturnValue(resendEvent);
  mockReceivingGet.mockReset().mockResolvedValue({ data: receivedEmailContent, error: null } as never);
  mockPrisma.ticket.findUnique.mockResolvedValue(null as never);
  // Benign default so the enqueues in the existing tests resolve cleanly; the
  // enqueue-failure tests below override these.
  mockEnqueue.mockResolvedValue(undefined);
  mockEnqueueAutoResolve.mockResolvedValue(undefined);
});

describe("POST /api/webhooks/inbound-email — webhook verification", () => {
  it("returns 500 when RESEND_WEBHOOK_SECRET is not configured", async () => {
    const original = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await postInboundEmail();

    expect(res.status).toBe(500);
    expect(mockVerify).not.toHaveBeenCalled();

    process.env.RESEND_WEBHOOK_SECRET = original;
  });

  it("returns 401 when a Svix header is missing", async () => {
    const { "svix-signature": _omit, ...incompleteHeaders } = SVIX_HEADERS;

    const res = await postInboundEmail(resendEvent, incompleteHeaders);

    expect(res.status).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("returns 401 when signature verification fails", async () => {
    // `Once` so the failure doesn't leak into later assertions in this test —
    // the base `mockReturnValue(resendEvent)` from beforeEach still applies
    // to any further calls.
    mockVerify.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const res = await postInboundEmail();

    expect(res.status).toBe(401);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });

  it("acknowledges (200) and ignores event types other than email.received", async () => {
    mockVerify.mockReturnValueOnce({ type: "email.sent", created_at: "", data: {} });

    const res = await postInboundEmail();

    expect(res.status).toBe(200);
    expect(mockReceivingGet).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });

  it("returns 502 when fetching the email content from Resend fails", async () => {
    mockReceivingGet.mockResolvedValueOnce({
      data: null,
      error: { name: "not_found", message: "Email not found" },
    } as never);

    const res = await postInboundEmail();

    expect(res.status).toBe(502);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email — bodyHtml", () => {
  it("stores the HTML part when Resend returns one", async () => {
    const html = "<p>I forgot my <strong>password</strong>.</p>";
    mockReceivingGet.mockResolvedValueOnce({ data: { ...receivedEmailContent, html }, error: null } as never);
    mockPrisma.ticket.create.mockResolvedValue({ ...created, bodyHtml: html } as never);

    const res = await postInboundEmail();

    expect(res.status).toBe(201);
    expect(res.body.bodyHtml).toBe(html);
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: {
        subject: resendEvent.data.subject,
        body: receivedEmailContent.text,
        bodyHtml: html,
        senderEmail: resendEvent.data.from,
        senderName: null,
        sourceMessageId: resendEvent.data.message_id,
      },
    });
  });

  it("stores null when Resend returns no html (plain-text-only mail)", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    const res = await postInboundEmail();

    expect(res.status).toBe(201);
    expect(res.body.bodyHtml).toBeNull();
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bodyHtml: null }),
    });
  });

  it("returns the existing ticket without recreating it on a duplicate messageId", async () => {
    const existing = { ...created, bodyHtml: "<p>original</p>" };
    mockPrisma.ticket.findUnique.mockResolvedValue(existing as never);

    const res = await postInboundEmail();

    expect(res.status).toBe(200);
    expect(res.body.bodyHtml).toBe("<p>original</p>");
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email — sender name", () => {
  it("stores null when Resend's `from` is a bare address", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    await postInboundEmail();

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "customer@example.com",
        senderName: null,
      }),
    });
  });

  it("parses the display name out of a `Name <email>` from header", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);
    mockVerify.mockReturnValueOnce({
      ...resendEvent,
      data: { ...resendEvent.data, from: "Alice Johnson <alice@example.com>" },
    });

    await postInboundEmail();

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "alice@example.com",
        senderName: "Alice Johnson",
      }),
    });
  });

  it("strips surrounding quotes from a quoted display name", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);
    mockVerify.mockReturnValueOnce({
      ...resendEvent,
      data: { ...resendEvent.data, from: '"Alice Johnson" <alice@example.com>' },
    });

    await postInboundEmail();

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "alice@example.com",
        senderName: "Alice Johnson",
      }),
    });
  });

  it("returns 400 when the extracted address is not a valid email", async () => {
    mockVerify.mockReturnValueOnce({
      ...resendEvent,
      data: { ...resendEvent.data, from: "not-an-email" },
    });

    const res = await postInboundEmail();

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email — AI queues", () => {
  beforeEach(() => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);
  });

  it("enqueues a durable classification job for the created ticket", async () => {
    const res = await postInboundEmail();

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("ticket-1");
    // The webhook hands the ticket id to the queue; the worker classifies later.
    expect(mockEnqueue).toHaveBeenCalledWith("ticket-1");
  });

  it("enqueues a durable auto-resolve job for the created ticket", async () => {
    const res = await postInboundEmail();

    expect(res.status).toBe(201);
    // Auto-resolution runs off the request path too; the worker consults the
    // knowledge base later.
    expect(mockEnqueueAutoResolve).toHaveBeenCalledWith("ticket-1");
  });

  it("does not classify or resolve inline — the request never writes to the ticket itself", async () => {
    await postInboundEmail();

    // Classification and auto-resolution (and any resulting ticket.update) are
    // the workers' job now, off the request path — the route only enqueues.
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("still creates the ticket (201) when enqueueing classification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error("queue unreachable"));

    const res = await postInboundEmail();

    // A queue outage must never turn a successfully-received ticket into a
    // failed one: the ticket is saved and the failure is only logged.
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("ticket-1");
    // The two enqueues are independent, so auto-resolve is still attempted.
    expect(mockEnqueueAutoResolve).toHaveBeenCalledWith("ticket-1");
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it("still creates the ticket (201) when enqueueing auto-resolve fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnqueueAutoResolve.mockRejectedValue(new Error("queue unreachable"));

    const res = await postInboundEmail();

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("ticket-1");
    // Classification is unaffected by the auto-resolve enqueue failing.
    expect(mockEnqueue).toHaveBeenCalledWith("ticket-1");
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it("does not enqueue anything for a duplicate ticket (same messageId)", async () => {
    // A resent email matches an existing ticket that was already handled on first
    // receipt, so no create and no re-enqueue of either job happens.
    mockPrisma.ticket.findUnique.mockResolvedValue(created as never);

    const res = await postInboundEmail();

    expect(res.status).toBe(200);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockEnqueueAutoResolve).not.toHaveBeenCalled();
  });
});
