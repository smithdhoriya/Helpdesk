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

const WEBHOOK_SECRET = "test-webhook-secret";
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = WEBHOOK_SECRET;

import { app } from "../app";
import { prisma } from "../db";

const mockPrisma = vi.mocked(prisma, true);

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
