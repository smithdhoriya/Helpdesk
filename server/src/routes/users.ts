import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { prisma } from "../db";
import { UserRole } from "../generated/client/enums";

export const usersRouter = Router();

function sendValidationError(res: Response, error: z.ZodError) {
  res.status(400).json({ error: error.issues[0].message });
}

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
  const users = await prisma.user.findMany({
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
