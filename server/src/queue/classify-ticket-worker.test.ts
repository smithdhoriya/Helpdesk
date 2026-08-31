import { beforeEach, describe, expect, it, vi } from "vitest";

// Unit-test the classification worker with no database and no model: stub Prisma
// and `classifyTicket`, but keep the real `classifyFailureReason` so the catch
// path's error classification is exercised rather than mocked away.
vi.mock("../db", () => ({
  prisma: {
    ticket: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../lib/classify-ticket", async (importActual) => ({
  ...(await importActual<typeof import("../lib/classify-ticket")>()),
  classifyTicket: vi.fn(),
}));

import { prisma } from "../db";
import { TicketCategory } from "../generated/client/enums";
import { classifyTicket } from "../lib/classify-ticket";
import { classifyAndSaveTicket, registerClassifyTicketWorker } from "./classify-ticket-worker";
import { CLASSIFY_TICKET_QUEUE } from "./index";

const mockPrisma = vi.mocked(prisma, true);
const mockClassify = vi.mocked(classifyTicket);

const ticketRow = { subject: "Refund please", body: "I want my money back." };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyAndSaveTicket", () => {
  it("re-reads the ticket, classifies it, and saves the category", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticketRow as never);
    mockClassify.mockResolvedValue(TicketCategory.refundRequest);

    await classifyAndSaveTicket("ticket-1");

    expect(mockClassify).toHaveBeenCalledWith({
      subject: ticketRow.subject,
      body: ticketRow.body,
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: { category: TicketCategory.refundRequest },
    });
  });

  it("no-ops when the ticket no longer exists (deleted while queued)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(null as never);

    await classifyAndSaveTicket("gone");

    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("re-throws on a classification failure (so pg-boss retries) and writes no category", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.ticket.findUnique.mockResolvedValue(ticketRow as never);
    mockClassify.mockRejectedValue(new Error("model unreachable"));

    await expect(classifyAndSaveTicket("ticket-1")).rejects.toThrow(/model unreachable/);

    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});

describe("registerClassifyTicketWorker", () => {
  it("subscribes to the classification queue and classifies each job's ticket", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(ticketRow as never);
    mockClassify.mockResolvedValue(TicketCategory.generalQuestion);

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

    await registerClassifyTicketWorker(fakeBoss as never);

    expect(registeredName).toBe(CLASSIFY_TICKET_QUEUE);

    await handler!([{ data: { ticketId: "ticket-7" } }]);

    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: "ticket-7" },
      data: { category: TicketCategory.generalQuestion },
    });
  });
});
