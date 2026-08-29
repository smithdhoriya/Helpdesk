import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { Prisma } from "../generated/client/client";
import { TicketCategory, TicketStatus } from "../generated/client/enums";
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
