import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db";
import { sendValidationError } from "../lib/validation";

export const ticketsRouter = Router();

const sortableFields = ["subject", "senderEmail", "status", "category", "createdAt"] as const;

const listTicketsQuerySchema = z.object({
  sortBy: z.enum(sortableFields).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { sortBy, sortOrder } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    orderBy: { [sortBy]: sortOrder },
  });

  res.json(tickets);
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
