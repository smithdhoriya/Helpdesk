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

const assignTicketSchema = z.object({
  assignedTo: z.string().nullable(),
});

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
  const parsed = assignTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { id } = req.params;
  const { assignedTo } = parsed.data;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (assignedTo) {
    const agent = await prisma.user.findUnique({ where: { id: assignedTo, deletedAt: null } });
    if (!agent) {
      res.status(400).json({ error: "Agent not found" });
      return;
    }
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: { assignedTo },
    include: { assignee: { select: { id: true, name: true } } },
  });

  res.json(updated);
});
