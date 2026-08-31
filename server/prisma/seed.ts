import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

import { prisma } from "../src/db";
import { AI_AGENT_EMAIL, AI_AGENT_NAME, AI_AGENT_ROLE } from "../src/lib/ai-agent";
import { UserRole } from "../src/generated/client/enums";

async function createUserIfMissing(options: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}) {
  const { email, password, name, role } = options;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping.`);
    return;
  }

  const userId = randomUUID();
  const hashedPassword = await hashPassword(password);

  await prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      role,
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
  });

  console.log(`Created ${role} user: ${email}`);
}

// Creates the AI agent that auto-resolution assigns tickets to while it works.
// It's a normal `agent` user (so it appears in the assignee list and the
// `assignedTo` relation), identified by a stable email, and — unlike seeded
// humans — has no credential account, since it never signs in. Idempotent.
async function createAiAgentIfMissing() {
  const existing = await prisma.user.findUnique({ where: { email: AI_AGENT_EMAIL } });
  if (existing) {
    console.log(`AI agent ${AI_AGENT_EMAIL} already exists, skipping.`);
    return;
  }

  await prisma.user.create({
    data: {
      id: randomUUID(),
      email: AI_AGENT_EMAIL,
      name: AI_AGENT_NAME,
      role: AI_AGENT_ROLE,
      emailVerified: true,
    },
  });

  console.log(`Created AI agent: ${AI_AGENT_EMAIL}`);
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD before running the seed script.",
    );
  }

  await createUserIfMissing({ email, password, name, role: UserRole.admin });

  // The AI agent that auto-resolution assigns tickets to. Seeded in every
  // environment (dev/prod included), since the auto-resolve worker relies on it.
  await createAiAgentIfMissing();

  // Optional second user with the `agent` role, used by E2E tests to cover
  // role-based access control. Only provisioned when both env vars are set
  // (e.g. in server/.env.test), so the plain `db:seed` script against
  // dev/prod (which has no AGENT_EMAIL/AGENT_PASSWORD) is unaffected.
  const agentEmail = process.env.AGENT_EMAIL;
  const agentPassword = process.env.AGENT_PASSWORD;
  const agentName = process.env.AGENT_NAME ?? "Agent";

  if (agentEmail && agentPassword) {
    await createUserIfMissing({
      email: agentEmail,
      password: agentPassword,
      name: agentName,
      role: UserRole.agent,
    });
  } else {
    console.log(
      "AGENT_EMAIL/AGENT_PASSWORD not set, skipping agent test user.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
