import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { enqueueTicketAutoResolve, enqueueTicketClassification } from "../queue";
import { sendValidationError } from "../lib/validation";

export const webhooksRouter = Router();

function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  if (!secret || req.header("x-webhook-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

const inboundEmailSchema = z.object({
  // A `From` value is either a bare address ("alice@x.com") or a name-addr
  // header ("Alice Johnson <alice@x.com>"), so it can't be validated as an
  // email up front — the address is extracted and validated below.
  from: z.string().trim().min(1, "From is required"),
  // The sender's display name, when the provider passes it separately. If
  // omitted, the name parsed out of a name-addr `from` header is used instead.
  // This is the only source of the customer's real name — it is never guessed
  // from the email address, so role addresses like `it@` never yield "It".
  fromName: z.string().trim().min(1).optional(),
  to: z.string().email(),
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string(),
  // Optional HTML part of the email. `nullish` (rather than `optional`)
  // because providers commonly send an explicit `null` for plain-text-only
  // mail, and that shouldn't reject the whole ticket.
  bodyHtml: z.string().nullish(),
  messageId: z.string().optional(),
});

// Splits a `From` value into the sender's display name and address. Handles a
// bare address ("alice@x.com" → no name) and an RFC-5322 name-addr
// ('Alice Johnson <alice@x.com>' or '"Alice Johnson" <alice@x.com>' → "Alice
// Johnson"). The display name is the customer's actual name as their mail
// client sent it; it is never derived from the local part of the address.
function parseFrom(from: string): { name: string | null; email: string } {
  const nameAddr = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (nameAddr) {
    const name = nameAddr[1]!.replace(/^"(.*)"$/, "$1").trim();
    return { name: name || null, email: nameAddr[2]!.trim() };
  }
  return { name: null, email: from.trim() };
}

webhooksRouter.post("/inbound-email", requireWebhookSecret, async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { from, fromName, subject, body, bodyHtml, messageId } = parsed.data;

  // Extract the address from the `From` value, then validate it as an email —
  // deferred from the schema because `from` may carry a display name too.
  const sender = parseFrom(from);
  const emailResult = z.string().email().safeParse(sender.email);
  if (!emailResult.success) {
    sendValidationError(res, emailResult.error);
    return;
  }

  // An explicit `fromName` wins over a name parsed from the header.
  const senderName = fromName ?? sender.name;

  if (messageId) {
    const existing = await prisma.ticket.findUnique({
      where: { sourceMessageId: messageId },
    });
    if (existing) {
      res.status(200).json(existing);
      return;
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      subject,
      body,
      bodyHtml: bodyHtml ?? null,
      senderEmail: emailResult.data,
      senderName: senderName ?? null,
      sourceMessageId: messageId ?? null,
    },
  });

  // Enqueue durable AI work — the ticket's category is filled in later and the
  // knowledge base is consulted to see if the ticket can be auto-resolved, both
  // by queue workers off the request path, so creating a ticket never waits on
  // the model. Awaiting only the (fast) enqueues guarantees the jobs are durably
  // recorded before we respond; a failure to enqueue either is logged but never
  // fails the webhook, since the ticket is already saved and an agent can pick it
  // up by hand. The two are independent, so one failing still enqueues the other.
  try {
    await enqueueTicketClassification(ticket.id);
  } catch (error) {
    console.error(`Failed to enqueue classification for ticket ${ticket.id}`, error);
  }

  try {
    await enqueueTicketAutoResolve(ticket.id);
  } catch (error) {
    console.error(`Failed to enqueue auto-resolve for ticket ${ticket.id}`, error);
  }

  res.status(201).json(ticket);
});
