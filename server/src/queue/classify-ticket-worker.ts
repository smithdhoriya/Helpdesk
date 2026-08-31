import type { PgBoss } from "pg-boss";

import { prisma } from "../db";
import { classifyFailureReason, classifyTicket } from "../lib/classify-ticket";
import { CLASSIFY_TICKET_QUEUE, type ClassifyTicketJob } from "./index";

/**
 * Classifies one ticket and saves its category — the unit of work behind a
 * classification job. Re-reads the ticket by id (the job only carried the id),
 * asks the model for a category, and writes it back.
 *
 * If the ticket no longer exists (deleted while the job was queued), this is a
 * no-op: there is nothing to classify and nothing to retry. Any other failure
 * — a model or daemon error — is logged with its reason and re-thrown, so
 * pg-boss retries the job per the queue's retry policy rather than silently
 * dropping it. Once retries are exhausted the ticket simply stays uncategorized.
 */
export async function classifyAndSaveTicket(ticketId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, body: true },
  });

  if (!ticket) {
    console.warn(`Skipping classification for ticket ${ticketId}: no longer exists`);
    return;
  }

  try {
    const category = await classifyTicket({ subject: ticket.subject, body: ticket.body });
    await prisma.ticket.update({ where: { id: ticketId }, data: { category } });
  } catch (error) {
    const reason = classifyFailureReason(error);
    console.error(`Failed to classify ticket ${ticketId} (${reason})`, error);
    // Re-throw so pg-boss records the failure and retries the job. A transient
    // outage recovers on a later attempt; a permanent one (e.g. the model was
    // never pulled) exhausts the retries and leaves the ticket uncategorized.
    throw error;
  }
}

/**
 * Subscribes a worker to the classification queue. Called once from `startQueue`
 * after the queue exists. pg-boss hands the handler a batch of jobs (one at a
 * time by default); each is processed independently so the worker keeps draining
 * the queue in the background, off the webhook's request path.
 */
export async function registerClassifyTicketWorker(boss: PgBoss): Promise<void> {
  await boss.work<ClassifyTicketJob>(CLASSIFY_TICKET_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await classifyAndSaveTicket(job.data.ticketId);
    }
  });
}
