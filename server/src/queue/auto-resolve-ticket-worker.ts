import type { PgBoss } from "pg-boss";

import { prisma } from "../db";
import { TicketStatus } from "../generated/client/enums";
import {
  autoResolveFailureReason,
  autoResolveTicket,
  loadKnowledgeBase,
} from "../lib/auto-resolve-ticket";
import { AUTO_RESOLVE_TICKET_QUEUE, type AutoResolveTicketJob } from "./index";

/**
 * Attempts to auto-resolve one ticket from the knowledge base — the unit of work
 * behind an auto-resolve job. Re-reads the ticket by id and drives it through the
 * lifecycle: an arriving ticket is `new`, is moved to `processing` while the model
 * decides, and lands at either `resolved` (the AI answered from the knowledge base)
 * or `open` (the AI withheld, so a human takes it).
 *
 * On a successful resolution the AI's reply plus the ticket's status/flag update
 * are written in a single transaction, so a ticket is never marked resolved without
 * its reply, or vice versa. The whole thing is idempotent: it only acts on a ticket
 * still awaiting a verdict (`new`/`processing`, not already `resolvedByAi`), so a
 * duplicate run can never post a second reply or clobber an agent's work.
 *
 * A model or daemon failure (the AI call throwing) is logged with its reason and
 * the ticket is routed to `open` with no reply — a human takes it — rather than
 * being left stranded in `processing`. The error is handled here so the job
 * completes; the idempotency guard makes `open` terminal, so a duplicate job
 * can't act on it again.
 */
export async function autoResolveAndSaveTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, body: true, senderName: true, status: true, resolvedByAi: true },
  });

  if (!ticket) {
    console.warn(`Skipping auto-resolve for ticket ${ticketId}: no longer exists`);
    return;
  }

  // Never act twice on the same ticket. Only tickets still awaiting an AI verdict
  // are eligible — `new` (just arrived) or `processing` (a prior attempt began but
  // the job is being retried). A ticket the AI already resolved, or one a human has
  // already moved to open/resolved/closed, is left untouched.
  if (
    ticket.resolvedByAi ||
    (ticket.status !== TicketStatus.new && ticket.status !== TicketStatus.processing)
  ) {
    return;
  }

  // Mark the ticket `processing` so the list shows the AI is actively working on
  // it. Skipped when already `processing` (a retried job) — that update would be a
  // no-op, and re-writing it just churns `updatedAt`.
  if (ticket.status !== TicketStatus.processing) {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.processing },
    });
  }

  try {
    const { canResolve, reply } = await autoResolveTicket(
      { subject: ticket.subject, body: ticket.body, customerName: ticket.senderName },
      loadKnowledgeBase(),
    );

    // The knowledge base didn't clearly cover this, or an escalation rule
    // applied: leave the ticket open for a human, with no reply.
    if (!canResolve || !reply) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.open },
      });
      return;
    }

    // Post the AI's reply and mark the ticket resolved together, so the list
    // never hides a ticket that has no answer in its thread. The reply carries
    // no author (it isn't a human agent) and is flagged as AI.
    await prisma.$transaction([
      prisma.reply.create({
        data: { ticketId, authorId: null, isAi: true, body: reply },
      }),
      prisma.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.resolved, resolvedByAi: true },
      }),
    ]);
  } catch (error) {
    const reason = autoResolveFailureReason(error);
    console.error(`Failed to auto-resolve ticket ${ticketId} (${reason})`, error);
    // The AI call threw (model/daemon failure). Rather than leave the ticket
    // stranded in `processing`, route it to a human: move it to `open` with no
    // reply. This keeps the lifecycle's terminal states to resolved/open, and the
    // idempotency guard (which only reprocesses new/processing) makes `open`
    // final, so a duplicate job can't act on it again. The error is handled here,
    // so the job completes rather than being retried into a no-op.
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.open },
    });
  }
}

/**
 * Subscribes a worker to the auto-resolve queue. Called once from `startQueue`
 * after the queue exists. pg-boss hands the handler a batch of jobs; each is
 * processed independently so the worker keeps draining the queue in the
 * background, off the webhook's request path.
 */
export async function registerAutoResolveTicketWorker(boss: PgBoss): Promise<void> {
  await boss.work<AutoResolveTicketJob>(AUTO_RESOLVE_TICKET_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await autoResolveAndSaveTicket(job.data.ticketId);
    }
  });
}
