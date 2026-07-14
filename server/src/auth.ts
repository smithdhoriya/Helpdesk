import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./db";
import { UserRole } from "./generated/client/enums";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  trustedOrigins: [process.env.TRUSTED_ORIGIN!],
  user: {
    additionalFields: {
      role: {
        type: Object.values(UserRole),
        required: true,
        defaultValue: UserRole.agent,
        input: false,
      },
    },
  },
});
