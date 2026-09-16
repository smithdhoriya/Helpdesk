import { randomUUID } from "node:crypto";
import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { prisma } from "../db";
import { UserRole } from "../generated/client/enums";
import { AI_AGENT_EMAIL } from "../lib/ai-agent";
import { sendValidationError } from "../lib/validation";

export const usersRouter = Router();

const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  password: z.union([
    z.literal(""),
    z.string().min(8, "Password must be at least 8 characters"),
  ]),
});

usersRouter.get("/", async (_req, res) => {
  // The AI agent (see `lib/ai-agent.ts`) is a real `User` row so tickets can be
  // assigned to it, but it has no credentials and isn't a manageable account —
  // exclude it here so it can't be accidentally edited or deleted from the
  // admin user list. It still appears in the ticket assignee list.
  const users = await prisma.user.findMany({
    where: { deletedAt: null, email: { not: AI_AGENT_EMAIL } },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  res.json(users);
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const userId = randomUUID();
  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      role: UserRole.agent,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: hashedPassword,
        },
      },
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  res.status(201).json(user);
});

usersRouter.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { id } = req.params;
  const { name, email, password } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email, NOT: { id } },
  });
  if (emailTaken) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const hashedPassword = password ? await hashPassword(password) : null;

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { name, email },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    ...(hashedPassword
      ? [
          prisma.account.updateMany({
            where: { userId: id, providerId: "credential" },
            data: { password: hashedPassword },
          }),
        ]
      : []),
  ]);

  res.json(user);
});

usersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id, deletedAt: null } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === UserRole.admin) {
    res.status(403).json({ error: "Admin users cannot be deleted" });
    return;
  }

  if (user.email === AI_AGENT_EMAIL) {
    res.status(403).json({ error: "The AI agent cannot be deleted" });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: id } }),
    // A deleted user is no longer assignable (they're filtered out of
    // GET /api/tickets/agents), so anything still assigned to them would be
    // stranded: it would keep showing their name with no way to reassign it
    // through the picker. Release that work back to the unassigned pool in the
    // same transaction, so a ticket is never left pointing at a deleted user.
    prisma.ticket.updateMany({
      where: { assignedTo: id },
      data: { assignedTo: null },
    }),
  ]);

  res.status(204).send();
});
