import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { prisma } from "../db";
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
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string(),
  // Optional HTML part of the email. `nullish` (rather than `optional`)
  // because providers commonly send an explicit `null` for plain-text-only
  // mail, and that shouldn't reject the whole ticket.
  bodyHtml: z.string().nullish(),
  messageId: z.string().optional(),
});

webhooksRouter.post("/inbound-email", requireWebhookSecret, async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { from, subject, body, bodyHtml, messageId } = parsed.data;

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
      senderEmail: from,
      sourceMessageId: messageId ?? null,
    },
  });

  res.status(201).json(ticket);
});
