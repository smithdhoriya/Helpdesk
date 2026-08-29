import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The tickets router sits behind `requireAuth` and talks to Prisma. We mock
// both so these are true unit tests of the route logic: no DB, no Better Auth,
// no network — just the request/response contract over real Express routing.
vi.mock("../db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    reply: { findMany: vi.fn(), create: vi.fn() },
  },
}));

// `app.ts` imports the real Better Auth instance only to mount `/api/auth/*`;
// stub it so constructing the app doesn't spin up Better Auth or hit env vars.
vi.mock("../auth", () => ({ auth: { handler: vi.fn() } }));

// Bypass session validation — auth itself is covered by its own E2E flow.
vi.mock("../middleware/require-auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "test-user" };
    next();
  },
}));

// tickets.ts imports `Prisma` only as a type; a bare stub avoids loading the
// generated Prisma runtime just to satisfy the value import.
vi.mock("../generated/client/client", () => ({ Prisma: {} }));

import { app } from "../app";
import { prisma } from "../db";

const mockPrisma = vi.mocked(prisma, true);

const ticket = {
  id: "ticket-1",
  subject: "Can't log in",
  body: "I forgot my password.",
  bodyHtml: "<p>I forgot my password.</p>",
  senderEmail: "customer@example.com",
  status: "open",
  category: "technicalQuestion",
  assignedTo: null as string | null,
  assignee: null as { id: string; name: string } | null,
  sourceMessageId: null,
  createdAt: new Date("2024-01-15T00:00:00.000Z"),
  updatedAt: new Date("2024-01-15T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/tickets/agents", () => {
  it("returns assignable users (id + name), excluding soft-deleted", async () => {
    const agents = [
      { id: "agent-1", name: "Alice Agent" },
      { id: "agent-2", name: "Bob Agent" },
    ];
    mockPrisma.user.findMany.mockResolvedValue(agents as never);

    const res = await request(app).get("/api/tickets/agents");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(agents);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
});

describe("GET /api/tickets/:id", () => {
  it("returns the ticket with its assignee", async () => {
    const withAssignee = {
      ...ticket,
      assignedTo: "agent-1",
      assignee: { id: "agent-1", name: "Alice Agent" },
    };
    mockPrisma.ticket.findUnique.mockResolvedValue(withAssignee as never);

    const res = await request(app).get("/api/tickets/ticket-1");

    expect(res.status).toBe(200);
    expect(res.body.assignee).toEqual({ id: "agent-1", name: "Alice Agent" });
    expect(res.body.bodyHtml).toBe("<p>I forgot my password.</p>");
    expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("returns a null bodyHtml for a plain-text-only ticket", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...ticket, bodyHtml: null } as never,
    );

    const res = await request(app).get("/api/tickets/ticket-1");

    expect(res.status).toBe(200);
    expect(res.body.bodyHtml).toBeNull();
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app).get("/api/tickets/missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
  });
});

describe("PATCH /api/tickets/:id", () => {
  it("assigns the ticket to an existing agent", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "agent-1" } as never);
    const updated = {
      ...ticket,
      assignedTo: "agent-1",
      assignee: { id: "agent-1", name: "Alice Agent" },
    };
    mockPrisma.ticket.update.mockResolvedValue(updated as never);

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ assignedTo: "agent-1" });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toEqual({ id: "agent-1", name: "Alice Agent" });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "agent-1", deletedAt: null },
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { assignedTo: "agent-1" },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("unassigns the ticket and skips the agent lookup when assignedTo is null", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.ticket.update.mockResolvedValue({ ...ticket, assignedTo: null } as never);

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ assignedTo: null });

    expect(res.status).toBe(200);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { assignedTo: null },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app)
      .patch("/api/tickets/missing")
      .send({ assignedTo: null });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the target agent does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.user.findUnique.mockResolvedValue(null as never);

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ assignedTo: "ghost-agent" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Agent not found" });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("updates the status without touching the agent lookup", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.ticket.update.mockResolvedValue({ ...ticket, status: "resolved" } as never);

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ status: "resolved" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("resolved");
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: "resolved" },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("updates the category", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.ticket.update.mockResolvedValue(
      { ...ticket, category: "refundRequest" } as never,
    );

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ category: "refundRequest" });

    expect(res.status).toBe(200);
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { category: "refundRequest" },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("clears the category when category is null", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.ticket.update.mockResolvedValue({ ...ticket, category: null } as never);

    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ category: null });

    expect(res.status).toBe(200);
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { category: null },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ status: "archived" });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid category value", async () => {
    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ category: "billing" });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails validation", async () => {
    const res = await request(app)
      .patch("/api/tickets/ticket-1")
      .send({ assignedTo: 123 });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/tickets/:id/replies", () => {
  it("returns the ticket's replies with authors, oldest first", async () => {
    const replies = [
      {
        id: "reply-1",
        ticketId: "ticket-1",
        authorId: "agent-1",
        body: "Have you tried resetting your password?",
        createdAt: new Date("2024-01-16T00:00:00.000Z"),
        author: { id: "agent-1", name: "Alice Agent" },
      },
    ];
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);

    const res = await request(app).get("/api/tickets/ticket-1/replies");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].author).toEqual({ id: "agent-1", name: "Alice Agent" });
    expect(mockPrisma.reply.findMany).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1" },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app).get("/api/tickets/missing/replies");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
    expect(mockPrisma.reply.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/tickets/:id/replies", () => {
  it("creates a reply authored by the current user", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    const created = {
      id: "reply-1",
      ticketId: "ticket-1",
      authorId: "test-user",
      body: "Thanks for reaching out.",
      createdAt: new Date("2024-01-16T00:00:00.000Z"),
      author: { id: "test-user", name: "Test User" },
    };
    mockPrisma.reply.create.mockResolvedValue(created as never);

    const res = await request(app)
      .post("/api/tickets/ticket-1/replies")
      .send({ body: "Thanks for reaching out." });

    expect(res.status).toBe(201);
    expect(res.body.author).toEqual({ id: "test-user", name: "Test User" });
    expect(mockPrisma.reply.create).toHaveBeenCalledWith({
      data: {
        ticketId: "ticket-1",
        authorId: "test-user",
        body: "Thanks for reaching out.",
      },
      include: { author: { select: { id: true, name: true } } },
    });
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/tickets/missing/replies")
      .send({ body: "Hello" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty reply body", async () => {
    const res = await request(app)
      .post("/api/tickets/ticket-1/replies")
      .send({ body: "   " });

    expect(res.status).toBe(400);
    expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is missing", async () => {
    const res = await request(app).post("/api/tickets/ticket-1/replies").send({});

    expect(res.status).toBe(400);
    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
  });
});
