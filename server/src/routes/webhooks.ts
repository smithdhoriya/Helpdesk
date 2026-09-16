import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { Resend } from "resend";

import { prisma } from "../db";
import { enqueueTicketAutoResolve, enqueueTicketClassification } from "../queue";
import { sendValidationError } from "../lib/validation";

export const webhooksRouter = Router();

// Used to gate POST /inbound-email via a static shared secret on the
// `x-webhook-secret` header. Resend's `email.received` webhook (the only
// caller of this route now — see below) carries its own Svix signature
// instead, verified with RESEND_WEBHOOK_SECRET, so this is no longer wired
// into the route. Left in place rather than deleted: INBOUND_EMAIL_WEBHOOK_SECRET
// is still a documented env var and this is its only reader.
function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  if (!secret || req.header("x-webhook-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

// Lazily built, mirroring lib/mailer.ts's outbound client, so importing this
// module never touches the network. Used for two things: verifying the
// Svix-signed webhook (pure signature check, no network call) and fetching a
// received email's content from Resend's Receiving API.
let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
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

// The ticket-creation contract, unchanged from before Resend was wired in:
// parse the sender, dedupe on messageId, create the ticket, then enqueue the
// two AI jobs off the request path. Takes already-schema-validated fields so
// the only caller (the Resend adapter below) validates its mapped payload
// with the same `inboundEmailSchema` before reaching this point.
async function createTicketFromInboundEmail(
  data: z.infer<typeof inboundEmailSchema>,
): Promise<
  | { ok: true; status: 200 | 201; ticket: Awaited<ReturnType<typeof prisma.ticket.create>> }
  | { ok: false; error: z.ZodError }
> {
  const { from, fromName, subject, body, bodyHtml, messageId } = data;

  // Extract the address from the `From` value, then validate it as an email —
  // deferred from the schema because `from` may carry a display name too.
  const sender = parseFrom(from);
  const emailResult = z.string().email().safeParse(sender.email);
  if (!emailResult.success) {
    return { ok: false, error: emailResult.error };
  }

  // An explicit `fromName` wins over a name parsed from the header.
  const senderName = fromName ?? sender.name;

  if (messageId) {
    const existing = await prisma.ticket.findUnique({
      where: { sourceMessageId: messageId },
    });
    if (existing) {
      return { ok: true, status: 200, ticket: existing };
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

  return { ok: true, status: 201, ticket };
}

webhooksRouter.post("/inbound-email", async (req, res) => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET is not set; rejecting inbound email webhook");
    res.status(500).json({ error: "Inbound email webhook is not configured" });
    return;
  }

  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature || !req.rawBody) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verified against the raw request bytes (see app.ts's express.json
  // `verify` option) — Svix signs the exact payload sent, not a re-serialized
  // copy of the parsed body, which can differ in key order/whitespace.
  let event;
  try {
    event = getResendClient().webhooks.verify({
      payload: req.rawBody.toString("utf8"),
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch (error) {
    console.error("Resend webhook signature verification failed", error);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Only `email.received` creates a ticket. Any other subscribed event type
  // is acknowledged (200) so Resend doesn't retry it, but otherwise ignored.
  if (event.type !== "email.received") {
    res.status(200).json({ received: true });
    return;
  }

  // The webhook payload carries only metadata — no body — by design (so large
  // attachments don't blow out serverless request-body limits). The actual
  // text/html content requires a separate call to the Receiving API.
  const { email_id, from, to, subject, message_id } = event.data;
  const { data: email, error: fetchError } = await getResendClient().emails.receiving.get(
    email_id,
  );

  if (fetchError || !email) {
    console.error(`Failed to fetch received email ${email_id} from Resend`, fetchError);
    res.status(502).json({ error: "Failed to fetch email content from Resend" });
    return;
  }

  const parsed = inboundEmailSchema.safeParse({
    from,
    to: to[0],
    subject,
    body: email.text ?? "",
    bodyHtml: email.html ?? null,
    messageId: message_id,
  });

  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const result = await createTicketFromInboundEmail(parsed.data);
  if (!result.ok) {
    sendValidationError(res, result.error);
    return;
  }

  res.status(result.status).json(result.ticket);
});
