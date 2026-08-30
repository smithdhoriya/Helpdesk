import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { Prisma } from "../generated/client/client";
import { TicketCategory, TicketStatus } from "../generated/client/enums";
import { polishFailureReason, polishModel, polishReply } from "../lib/polish-reply";
import { sendValidationError } from "../lib/validation";

export const ticketsRouter = Router();

const sortableFields = ["subject", "senderEmail", "status", "category", "createdAt"] as const;
const PAGE_SIZE = 10;

const listTicketsQuerySchema = z.object({
  sortBy: z.enum(sortableFields).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(TicketStatus).optional(),
  category: z.enum([...Object.values(TicketCategory), "uncategorized"]).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const updateTicketSchema = z.object({
  assignedTo: z.string().nullable().optional(),
  status: z.enum(TicketStatus).optional(),
  category: z.enum(TicketCategory).nullable().optional(),
});

const createReplySchema = z.object({
  body: z.string().trim().min(1, "Reply cannot be empty"),
});

const replyAuthorSelect = { id: true, name: true } as const;

ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { sortBy, sortOrder, status, category, search, page } = parsed.data;

  const where: Prisma.TicketWhereInput = {
    status,
    category: category === "uncategorized" ? null : category,
    ...(search && {
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ tickets, total, page, pageSize: PAGE_SIZE });
});

// Registered before "/:id" so "agents" isn't captured as a ticket id.
ticketsRouter.get("/agents", async (_req, res) => {
  const agents = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  res.json(agents);
});

ticketsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { assignee: { select: { id: true, name: true } } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(ticket);
});

ticketsRouter.patch("/:id", async (req, res) => {
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { id } = req.params;
  const data = parsed.data;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (data.assignedTo) {
    const agent = await prisma.user.findUnique({ where: { id: data.assignedTo, deletedAt: null } });
    if (!agent) {
      res.status(400).json({ error: "Agent not found" });
      return;
    }
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data,
    include: { assignee: { select: { id: true, name: true } } },
  });

  res.json(updated);
});

ticketsRouter.get("/:id/replies", async (req, res) => {
  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const replies = await prisma.reply.findMany({
    where: { ticketId: id },
    include: { author: { select: replyAuthorSelect } },
    orderBy: { createdAt: "asc" },
  });

  res.json(replies);
});

ticketsRouter.post("/:id/replies", async (req, res) => {
  const parsed = createReplySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const reply = await prisma.reply.create({
    data: {
      ticketId: id,
      authorId: req.user!.id,
      body: parsed.data.body,
    },
    include: { author: { select: replyAuthorSelect } },
  });

  res.status(201).json(reply);
});

// Rewrites a draft reply without persisting anything — the polished text goes
// back to the agent's textarea for them to edit and send (or discard).
ticketsRouter.post("/:id/replies/polish", async (req, res) => {
  const parsed = createReplySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    // Only the agent's draft is polished — the ticket is loaded here purely for
    // the 404 check above and the customer's stored name, never fed to the
    // model, so a short draft stays a short reply instead of being rewritten
    // from the ticket. The polished reply is addressed to the customer using
    // their real name (`senderName`, captured at ingestion) and signed off with
    // the authenticated agent's name. When no name was captured, an empty string
    // is passed so the reply still opens with a generic "Dear Customer," — a
    // name is never invented from the email address or the draft.
    const body = await polishReply(parsed.data.body, {
      customerName: ticket.senderName ?? "",
      agentName: req.user!.name,
    });
    res.json({ body });
  } catch (error) {
    const reason = polishFailureReason(error);

    // The provider's own message is the only place the real cause shows up
    // (daemon not running, model never pulled, an empty completion), so log it
    // alongside the classification.
    console.error(`Failed to polish reply (${reason})`, error);

    // Both of these are operator problems that a retry won't fix, and a bare
    // "Failed to polish reply" tells the agent nothing about which side is
    // broken or who can fix it.
    if (reason === "unreachable") {
      res.status(503).json({
        error: "Reply polishing is unavailable (cannot reach the local AI service)",
      });
      return;
    }

    if (reason === "modelMissing") {
      res.status(503).json({
        error: `Reply polishing is unavailable (the "${polishModel}" model is not installed)`,
      });
      return;
    }

    // Anything else is transient from the agent's point of view: keep their
    // draft and let them retry or send it as-is.
    res.status(502).json({ error: "Failed to polish reply" });
  }
});
