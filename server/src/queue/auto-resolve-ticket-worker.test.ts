import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit-test the auto-resolve worker with no database and no model: stub Prisma,
// `autoResolveTicket`, and `loadKnowledgeBase`, but keep the real
// `autoResolveFailureReason` so the catch path's error classification is
// exercised rather than mocked away.
vi.mock("../db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
    reply: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../lib/auto-resolve-ticket", async (importActual) => ({
  ...(await importActual<typeof import("../lib/auto-resolve-ticket")>()),
  autoResolveTicket: vi.fn(),
  loadKnowledgeBase: vi.fn(() => "KNOWLEDGE BASE TEXT"),
}));

import { prisma } from "../db";
import { TicketStatus } from "../generated/client/enums";
import { autoResolveTicket, loadKnowledgeBase } from "../lib/auto-resolve-ticket";
import {
  autoResolveAndSaveTicket,
  registerAutoResolveTicketWorker,
} from "./auto-resolve-ticket-worker";
import { AUTO_RESOLVE_TICKET_QUEUE } from "./index";

const mockPrisma = vi.mocked(prisma, true);
const mockAutoResolve = vi.mocked(autoResolveTicket);
const mockLoadKb = vi.mocked(loadKnowledgeBase);

const newTicket = {
  subject: "How do I reset my password?",
  body: "I forgot it.",
  senderName: "Alice Johnson" as string | null,
  status: TicketStatus.new,
  resolvedByAi: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoResolveAndSaveTicket", () => {
  it("moves the ticket to processing, then posts the AI reply and marks it resolved in one transaction", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(newTicket as never);
    mockAutoResolve.mockResolvedValue({ canResolve: true, reply: "Hi Alice,\n\nReset it." });

    await autoResolveAndSaveTicket("ticket-1");

    // The customer's ticket + captured name and the loaded knowledge base are
    // handed to the resolver.
    expect(mockAutoResolve).toHaveBeenCalledWith(
      { subject: newTicket.subject, body: newTicket.body, customerName: "Alice Johnson" },
      "KNOWLEDGE BASE TEXT",
    );
    expect(mockLoadKb).toHaveBeenCalled();

    // A `new` ticket is first flipped to `processing` while the model decides.
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.processing },
    });

    // Reply + resolved status update are written together via $transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.reply.create).toHaveBeenCalledWith({
      data: { ticketId: "ticket-1", authorId: null, isAi: true, body: "Hi Alice,\n\nReset it." },
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.resolved, resolvedByAi: true },
    });
  });

  it("skips the redundant processing update when a retried job finds the ticket already processing", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...newTicket, status: TicketStatus.processing } as never,
    );
    mockAutoResolve.mockResolvedValue({ canResolve: true, reply: "Hi Alice,\n\nReset it." });

    await autoResolveAndSaveTicket("ticket-1");

    // Already `processing`, so it is not re-written to `processing`; the only
    // status update is the final resolved transition.
    expect(mockPrisma.ticket.update).not.toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.processing },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("moves the ticket to processing then back to open when the AI declines to resolve", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(newTicket as never);
    mockAutoResolve.mockResolvedValue({ canResolve: false, reply: null });

    await autoResolveAndSaveTicket("ticket-1");

    // No reply is posted and nothing is written transactionally; the ticket is
    // simply left open (with no reply) for a human.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.processing },
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.open },
    });
  });

  it("no-ops when the ticket no longer exists (deleted while queued)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    await autoResolveAndSaveTicket("gone");

    expect(mockAutoResolve).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("no-ops when the ticket was already resolved by the AI (a retried job)", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...newTicket, resolvedByAi: true, status: TicketStatus.resolved } as never,
    );

    await autoResolveAndSaveTicket("ticket-1");

    expect(mockAutoResolve).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("no-ops when the AI already withheld and left the ticket open (a retried job)", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...newTicket, status: TicketStatus.open } as never,
    );

    await autoResolveAndSaveTicket("ticket-1");

    // `open` is a terminal verdict (the AI withheld earlier), so a duplicate job
    // must not reprocess it or write anything.
    expect(mockAutoResolve).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("no-ops when a human has already moved the ticket to resolved/closed", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(
      { ...newTicket, status: TicketStatus.closed } as never,
    );

    await autoResolveAndSaveTicket("ticket-1");

    expect(mockAutoResolve).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("routes the ticket to open (no reply) when the AI call throws, so a human takes it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(newTicket as never);
    mockAutoResolve.mockRejectedValue(new Error("model unreachable"));

    // The failure is handled inside the worker, so the job completes rather than
    // throwing back to pg-boss.
    await expect(autoResolveAndSaveTicket("ticket-1")).resolves.toBeUndefined();

    // The ticket first moved to processing, then the failure routed it to open.
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.processing },
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { status: TicketStatus.open },
    });
    // No reply is posted and nothing is committed transactionally.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.reply.create).not.toHaveBeenCalled();
    // The failure reason is still logged.
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("registerAutoResolveTicketWorker", () => {
  it("subscribes to the auto-resolve queue and processes each job's ticket", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(newTicket as never);
    mockAutoResolve.mockResolvedValue({ canResolve: true, reply: "Hi Alice,\n\nReset it." });

    // Capture what the worker registers, then drive its handler with a batch of
    // jobs exactly as pg-boss hands them over (an array of `{ data }`).
    let registeredName: string | undefined;
    let handler:
      | ((jobs: { data: { ticketId: string } }[]) => Promise<unknown>)
      | undefined;
    const fakeBoss = {
      work: vi.fn(async (name: string, h: typeof handler) => {
        registeredName = name;
        handler = h;
        return "worker-id";
      }),
    };

    await registerAutoResolveTicketWorker(fakeBoss as never);

    expect(registeredName).toBe(AUTO_RESOLVE_TICKET_QUEUE);

    await handler!([{ data: { ticketId: "ticket-7" } }]);

    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-7" },
      data: { status: TicketStatus.resolved, resolvedByAi: true },
    });
  });
});
