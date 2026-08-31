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

const WEBHOOK_SECRET = "test-webhook-secret";
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = WEBHOOK_SECRET;

import { app } from "../app";
import { prisma } from "../db";
import { enqueueTicketAutoResolve, enqueueTicketClassification } from "../queue";

const mockPrisma = vi.mocked(prisma, true);
const mockEnqueue = vi.mocked(enqueueTicketClassification);
const mockEnqueueAutoResolve = vi.mocked(enqueueTicketAutoResolve);

const payload = {
  from: "customer@example.com",
  to: "support@example.com",
  subject: "Can't log in",
  body: "I forgot my password.",
  messageId: "message-1",
};

const created = {
  id: "ticket-1",
  subject: payload.subject,
  body: payload.body,
  bodyHtml: null as string | null,
  senderEmail: payload.from,
  senderName: null as string | null,
  status: "open",
  category: null,
  assignedTo: null,
  sourceMessageId: payload.messageId,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  updatedAt: new Date("2024-01-15T00:00:00.000Z"),
};

function postInboundEmail(data: Record<string, unknown>) {
  return request(app)
    .post("/api/webhooks/inbound-email")
    .set("x-webhook-secret", WEBHOOK_SECRET)
    .send(data);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.ticket.findUnique.mockResolvedValue(null as never);
  // Benign default so the enqueues in the existing tests resolve cleanly; the
  // enqueue-failure tests below override these.
  mockEnqueue.mockResolvedValue(undefined);
  mockEnqueueAutoResolve.mockResolvedValue(undefined);
});

describe("POST /api/webhooks/inbound-email — bodyHtml", () => {
  it("stores the HTML part when the payload includes one", async () => {
    const bodyHtml = "<p>I forgot my <strong>password</strong>.</p>";
    mockPrisma.ticket.create.mockResolvedValue({ ...created, bodyHtml } as never);

    const res = await postInboundEmail({ ...payload, bodyHtml });

    expect(res.status).toBe(201);
    expect(res.body.bodyHtml).toBe(bodyHtml);
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: {
        subject: payload.subject,
        body: payload.body,
        bodyHtml,
        senderEmail: payload.from,
        senderName: null,
        sourceMessageId: payload.messageId,
      },
    });
  });

  it("stores null when the payload omits bodyHtml", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    const res = await postInboundEmail(payload);

    expect(res.status).toBe(201);
    expect(res.body.bodyHtml).toBeNull();
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bodyHtml: null }),
    });
  });

  it("accepts an explicit null bodyHtml (plain-text-only mail)", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    const res = await postInboundEmail({ ...payload, bodyHtml: null });

    expect(res.status).toBe(201);
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bodyHtml: null }),
    });
  });

  it("returns 400 when bodyHtml is not a string", async () => {
    const res = await postInboundEmail({ ...payload, bodyHtml: 123 });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });

  it("returns the existing ticket without recreating it on a duplicate messageId", async () => {
    const existing = { ...created, bodyHtml: "<p>original</p>" };
    mockPrisma.ticket.findUnique.mockResolvedValue(existing as never);

    const res = await postInboundEmail({ ...payload, bodyHtml: "<p>resent</p>" });

    expect(res.status).toBe(200);
    expect(res.body.bodyHtml).toBe("<p>original</p>");
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email — sender name", () => {
  it("stores null when `from` is a bare address and no name is given", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    await postInboundEmail(payload);

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "customer@example.com",
        senderName: null,
      }),
    });
  });

  it("parses the display name out of a `Name <email>` from header", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    await postInboundEmail({ ...payload, from: "Alice Johnson <alice@example.com>" });

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "alice@example.com",
        senderName: "Alice Johnson",
      }),
    });
  });

  it("strips surrounding quotes from a quoted display name", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    await postInboundEmail({ ...payload, from: '"Alice Johnson" <alice@example.com>' });

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "alice@example.com",
        senderName: "Alice Johnson",
      }),
    });
  });

  it("prefers an explicit `fromName` over a name in the header", async () => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);

    await postInboundEmail({
      ...payload,
      from: "Bot <alice@example.com>",
      fromName: "Alice Johnson",
    });

    expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderEmail: "alice@example.com",
        senderName: "Alice Johnson",
      }),
    });
  });

  it("returns 400 when the extracted address is not a valid email", async () => {
    const res = await postInboundEmail({ ...payload, from: "not-an-email" });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/inbound-email — AI queues", () => {
  beforeEach(() => {
    mockPrisma.ticket.create.mockResolvedValue(created as never);
  });

  it("enqueues a durable classification job for the created ticket", async () => {
    const res = await postInboundEmail(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("ticket-1");
    // The webhook hands the ticket id to the queue; the worker classifies later.
    expect(mockEnqueue).toHaveBeenCalledWith("ticket-1");
  });

  it("enqueues a durable auto-resolve job for the created ticket", async () => {
    const res = await postInboundEmail(payload);

    expect(res.status).toBe(201);
    // Auto-resolution runs off the request path too; the worker consults the
    // knowledge base later.
    expect(mockEnqueueAutoResolve).toHaveBeenCalledWith("ticket-1");
  });

  it("does not classify or resolve inline — the request never writes to the ticket itself", async () => {
    await postInboundEmail(payload);

    // Classification and auto-resolution (and any resulting ticket.update) are
    // the workers' job now, off the request path — the route only enqueues.
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("still creates the ticket (201) when enqueueing classification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error("queue unreachable"));

    const res = await postInboundEmail(payload);

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

    const res = await postInboundEmail(payload);

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

    const res = await postInboundEmail(payload);

    expect(res.status).toBe(200);
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockEnqueueAutoResolve).not.toHaveBeenCalled();
  });
});
