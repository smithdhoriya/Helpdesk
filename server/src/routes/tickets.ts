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

ticketsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  res.json(ticket);
});
