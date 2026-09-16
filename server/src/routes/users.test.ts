import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The users router talks to Prisma; mock it so these are true unit tests of the
// route logic. `$transaction` takes the array form here, so it just resolves the
// operations the route handed it — the individual mocks below record the calls.
vi.mock("../db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    ticket: { updateMany: vi.fn() },
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
  },
}));

// `app.ts` imports the real Better Auth instance only to mount `/api/auth/*`;
// stub it so constructing the app doesn't spin up Better Auth or hit env vars.
vi.mock("../auth", () => ({ auth: { handler: vi.fn() } }));

// Bypass session validation, but hand `requireAdmin` a real admin so the actual
// authorization middleware still runs.
vi.mock("../middleware/require-auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "admin-1", role: "admin" };
    next();
  },
}));

import { app } from "../app";
import { prisma } from "../db";
import { UserRole } from "../generated/client/enums";
import { AI_AGENT_EMAIL, AI_AGENT_NAME, AI_AGENT_ROLE } from "../lib/ai-agent";

const mockPrisma = vi.mocked(prisma, true);

const agent = {
  id: "agent-1",
  name: "Alice Agent",
  email: "alice@example.com",
  role: UserRole.agent,
  deletedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((operations: unknown) =>
    Promise.all(operations as unknown[]),
  );
});

describe("GET /api/users", () => {
  it("excludes the AI agent from the returned users", async () => {
    mockPrisma.user.findMany.mockResolvedValue([agent] as never);

    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, email: { not: AI_AGENT_EMAIL } },
      }),
    );
    expect(res.body).toEqual([agent]);
  });
});

describe("DELETE /api/users/:id", () => {
  it("unassigns every ticket assigned to the deleted user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(agent as never);

    const res = await request(app).delete("/api/users/agent-1");

    expect(res.status).toBe(204);
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { assignedTo: "agent-1" },
      data: { assignedTo: null },
    });
  });

  it("unassigns tickets in the same transaction as the soft delete", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(agent as never);

    await request(app).delete("/api/users/agent-1");

    // One transaction covering all three writes: if the unassign fails, the
    // user must not end up deleted with tickets still pointing at them.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction.mock.calls[0]![0]).toHaveLength(3);
  });

  it("still soft-deletes the user and clears their sessions", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(agent as never);

    await request(app).delete("/api/users/agent-1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "agent-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "agent-1" },
    });
  });

  it("does not touch tickets when the user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null as never);

    const res = await request(app).delete("/api/users/missing");

    expect(res.status).toBe(404);
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not touch tickets when the target is an admin", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...agent,
      role: UserRole.admin,
    } as never);

    const res = await request(app).delete("/api/users/admin-2");

    expect(res.status).toBe(403);
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not touch tickets when the target is the AI agent", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...agent,
      id: "ai-agent-1",
      email: AI_AGENT_EMAIL,
      name: AI_AGENT_NAME,
      role: AI_AGENT_ROLE,
    } as never);

    const res = await request(app).delete("/api/users/ai-agent-1");

    expect(res.status).toBe(403);
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
