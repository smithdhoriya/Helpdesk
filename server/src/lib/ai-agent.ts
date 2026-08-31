import { prisma } from "../db";
import { UserRole } from "../generated/client/enums";

/**
 * The auto-resolution AI is modeled as a regular agent `User`, so tickets it is
 * working on can be assigned to it exactly like a human agent (same `assignedTo`
 * relation, same assignee dropdown). It is identified by a stable email — names
 * aren't unique in the schema — created once by the seed script, and never logs
 * in (it has no credential account).
 */
export const AI_AGENT_EMAIL = "ai@helpdesk.local";
export const AI_AGENT_NAME = "AI";
export const AI_AGENT_ROLE = UserRole.agent;

// The AI agent row is created once by the seed and its id never changes, so the
// first successful lookup is cached for the life of the process. A miss isn't
// cached, so a lookup that runs before the seed can succeed on a later call.
let cachedAiAgentId: string | null = null;

/**
 * Resolves the AI agent's user id, caching it after the first hit. Returns `null`
 * when the AI agent hasn't been seeded yet, so callers can degrade gracefully
 * (skip the assignment) rather than crash the auto-resolve job.
 */
export async function getAiAgentId(): Promise<string | null> {
  if (cachedAiAgentId) return cachedAiAgentId;

  const agent = await prisma.user.findUnique({
    where: { email: AI_AGENT_EMAIL },
    select: { id: true },
  });

  cachedAiAgentId = agent?.id ?? null;
  return cachedAiAgentId;
}
