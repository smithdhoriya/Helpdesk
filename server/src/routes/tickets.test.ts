import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { APICallError, RetryError } from "ai";

// The tickets router sits behind `requireAuth` and talks to Prisma. We mock
// both so these are true unit tests of the route logic: no DB, no Better Auth,
// no network — just the request/response contract over real Express routing.
vi.mock("../db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    ticket: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    reply: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// `app.ts` imports the real Better Auth instance only to mount `/api/auth/*`;
// stub it so constructing the app doesn't spin up Better Auth or hit env vars.
vi.mock("../auth", () => ({ auth: { handler: vi.fn() } }));

// Bypass session validation — auth itself is covered by its own E2E flow.
vi.mock("../middleware/require-auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "test-user", name: "Test User" };
    next();
  },
}));

// tickets.ts imports `Prisma` only as a type; a bare stub avoids loading the
// generated Prisma runtime just to satisfy the value import.
vi.mock("../generated/client/client", () => ({ Prisma: {} }));

// Stub the AI SDK call so these tests never start a model. The prompt itself is
// not a contract worth asserting on; the route's behaviour around it is. The
// real `polishFailureReason` is kept so the error classification the route
// depends on is covered rather than mocked away.
vi.mock("../lib/polish-reply", async (importActual) => ({
  ...(await importActual<typeof import("../lib/polish-reply")>()),
  polishReply: vi.fn(),
}));

// Same treatment for the summarizer: stub the model call, keep the real
// `summaryFailureReason` so the route's error classification is exercised.
vi.mock("../lib/summarize-ticket", async (importActual) => ({
  ...(await importActual<typeof import("../lib/summarize-ticket")>()),
  summarizeTicket: vi.fn(),
}));

import { app } from "../app";
import { prisma } from "../db";
import { polishModel, polishReply } from "../lib/polish-reply";
import { summarizeTicket, summaryModel } from "../lib/summarize-ticket";

const mockPrisma = vi.mocked(prisma, true);
const mockPolishReply = vi.mocked(polishReply);
const mockSummarizeTicket = vi.mocked(summarizeTicket);

const ticket = {
  id: "ticket-1",
  subject: "Can't log in",
  body: "I forgot my password.",
  bodyHtml: "<p>I forgot my password.</p>",
  senderEmail: "customer@example.com",
  senderName: "Alice Johnson" as string | null,
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

describe("GET /api/tickets", () => {
  beforeEach(() => {
    // The route reads its results out of `$transaction([findMany, count])`, so
    // the transaction mock is what actually feeds the response; findMany/count
    // are still spied on to assert the query the route builds.
    mockPrisma.ticket.findMany.mockResolvedValue([ticket] as never);
    mockPrisma.ticket.count.mockResolvedValue(1 as never);
    mockPrisma.$transaction.mockResolvedValue([[ticket], 1] as never);
  });

  it("returns the first page of tickets with pagination metadata", async () => {
    const res = await request(app).get("/api/tickets");

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].id).toBe("ticket-1");
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    // Default sort is newest-first, first page, no filters applied.
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
      where: { status: undefined, category: undefined },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 10,
    });
  });

  it("filters by status and category and builds a case-insensitive search", async () => {
    const res = await request(app).get(
      "/api/tickets?status=open&category=technicalQuestion&search=login",
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
      where: {
        status: "open",
        category: "technicalQuestion",
        OR: [
          { subject: { contains: "login", mode: "insensitive" } },
          { senderEmail: { contains: "login", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 10,
    });
  });

  it("maps the 'uncategorized' filter to a null category", async () => {
    await request(app).get("/api/tickets?category=uncategorized");

    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: null }) }),
    );
  });

  it("honours the sort field, direction, and page offset", async () => {
    await request(app).get("/api/tickets?sortBy=subject&sortOrder=asc&page=3");

    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { subject: "asc" },
        skip: 20,
        take: 10,
      }),
    );
  });

  it("returns 400 for an invalid sort field without querying", async () => {
    const res = await request(app).get("/api/tickets?sortBy=bogus");

    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
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

describe("POST /api/tickets/:id/replies/polish", () => {
  const draft = "hey we cant reset you're password until u verify the email";

  function postPolish(body: Record<string, unknown>) {
    return request(app).post("/api/tickets/ticket-1/replies/polish").send(body);
  }

  it("returns the polished draft", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPolishReply.mockResolvedValue("Polished version.");

    const res = await postPolish({ body: draft });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: "Polished version." });
    // Only the agent's draft is polished — no ticket context is handed to the
    // model, so a short draft stays a short reply. The customer's real name
    // (`ticket.senderName`, captured at ingestion) and the authenticated agent's
    // name are passed through so the polished reply can be addressed and signed
    // off. The name is never derived from the email address.
    expect(mockPolishReply).toHaveBeenCalledWith(draft, {
      customerName: "Alice Johnson",
      agentName: "Test User",
    });
  });

  it("passes an empty customer name when the ticket has none, rather than guessing from the email", async () => {
    // A ticket from a role address like `it@rivermill.org` with no captured
    // sender name must not be greeted with a name invented from the local part
    // ("Dear It,"). An empty `customerName` is passed instead so `polishReply`
    // falls back to a generic "Dear Customer," — addressed, but never guessed.
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...ticket, senderEmail: "it@rivermill.org", senderName: null } as never,
    );
    mockPolishReply.mockResolvedValue("Polished version.");

    await postPolish({ body: draft });

    expect(mockPolishReply).toHaveBeenCalledWith(draft, {
      customerName: "",
      agentName: "Test User",
    });
  });

  it("does not persist a reply", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPolishReply.mockResolvedValue("Polished version.");

    await postPolish({ body: draft });

    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app)
      .post("/api/tickets/missing/replies/polish")
      .send({ body: draft });

    expect(res.status).toBe(404);
    expect(mockPolishReply).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty draft without calling the model", async () => {
    const res = await postPolish({ body: "   " });

    expect(res.status).toBe(400);
    expect(mockPolishReply).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
  });

  it("returns 502 when the model call fails", async () => {
    // The route logs the provider error; keep it out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPolishReply.mockRejectedValue(new Error("rate limited"));

    const res = await postPolish({ body: draft });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Failed to polish reply" });
    // The provider's own message must not leak to the client.
    expect(JSON.stringify(res.body)).not.toContain("rate limited");
  });

  it("returns 503 when the local AI service is not reachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    // Shaped like a real refused socket: the SDK reports no HTTP status because
    // no response came back, marks it retryable, so it arrives wrapped.
    mockPolishReply.mockRejectedValue(
      new RetryError({
        message: "Failed after 2 attempts",
        reason: "maxRetriesExceeded",
        errors: [
          new APICallError({
            message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
            url: "http://127.0.0.1:11434/api/chat",
            requestBodyValues: {},
            isRetryable: true,
          }),
        ],
      }),
    );

    const res = await postPolish({ body: draft });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("cannot reach the local AI service");
    // The socket-level detail is for the server log, not the agent.
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });

  it("returns 503 naming the model when it has not been pulled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    // Ollama answers 404 for a model it doesn't have. It isn't retryable, so it
    // reaches the route unwrapped.
    mockPolishReply.mockRejectedValue(
      new APICallError({
        message: `model "${polishModel}" not found, try pulling it first`,
        url: "http://127.0.0.1:11434/api/chat",
        requestBodyValues: {},
        statusCode: 404,
      }),
    );

    const res = await postPolish({ body: draft });

    expect(res.status).toBe(503);
    // Naming the model is what makes the error actionable (`ollama pull <model>`).
    expect(res.body.error).toContain(polishModel);
    expect(res.body.error).toContain("not installed");
  });
});

describe("POST /api/tickets/:id/summarize", () => {
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

  function postSummarize() {
    return request(app).post("/api/tickets/ticket-1/summarize").send();
  }

  it("returns a freshly generated summary of the ticket and its replies", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockResolvedValue("Customer can't log in; agent suggested a reset.");

    const res = await postSummarize();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: "Customer can't log in; agent suggested a reset." });
    // The ticket subject/body and each reply (by author name, oldest first) are
    // handed to the summarizer — this is the one AI path that *is* given ticket
    // context, unlike polishing.
    expect(mockSummarizeTicket).toHaveBeenCalledWith({
      subject: ticket.subject,
      body: ticket.body,
      replies: [{ author: "Alice Agent", body: "Have you tried resetting your password?" }],
    });
  });

  it("reads the replies oldest-first", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockResolvedValue("Summary.");

    await postSummarize();

    expect(mockPrisma.reply.findMany).toHaveBeenCalledWith({
      where: { ticketId: "ticket-1" },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  it("summarizes a ticket with no replies", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue([] as never);
    mockSummarizeTicket.mockResolvedValue("Customer can't log in.");

    const res = await postSummarize();

    expect(res.status).toBe(200);
    expect(mockSummarizeTicket).toHaveBeenCalledWith({
      subject: ticket.subject,
      body: ticket.body,
      replies: [],
    });
  });

  it("does not persist anything", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockResolvedValue("Summary.");

    await postSummarize();

    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    const res = await request(app).post("/api/tickets/missing/summarize").send();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
    expect(mockPrisma.reply.findMany).not.toHaveBeenCalled();
    expect(mockSummarizeTicket).not.toHaveBeenCalled();
  });

  it("returns 502 when the model call fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockRejectedValue(new Error("rate limited"));

    const res = await postSummarize();

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Failed to summarize ticket" });
    expect(JSON.stringify(res.body)).not.toContain("rate limited");
  });

  it("returns 503 when the local AI service is not reachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockRejectedValue(
      new RetryError({
        message: "Failed after 2 attempts",
        reason: "maxRetriesExceeded",
        errors: [
          new APICallError({
            message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
            url: "http://127.0.0.1:11434/api/chat",
            requestBodyValues: {},
            isRetryable: true,
          }),
        ],
      }),
    );

    const res = await postSummarize();

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("cannot reach the local AI service");
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });

  it("returns 503 naming the model when it has not been pulled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticket as never);
    mockPrisma.reply.findMany.mockResolvedValue(replies as never);
    mockSummarizeTicket.mockRejectedValue(
      new APICallError({
        message: `model "${summaryModel}" not found, try pulling it first`,
        url: "http://127.0.0.1:11434/api/chat",
        requestBodyValues: {},
        statusCode: 404,
      }),
    );

    const res = await postSummarize();

    expect(res.status).toBe(503);
    expect(res.body.error).toContain(summaryModel);
    expect(res.body.error).toContain("not installed");
  });
});
