import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./db";
import { UserRole } from "./generated/client/enums";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  trustedOrigins: [process.env.TRUSTED_ORIGIN!],
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;

      const user = await prisma.user.findUnique({
        where: { email: ctx.body.email },
      });

      if (user?.deletedAt) {
        throw new APIError("FORBIDDEN", {
          message: "This account has been deactivated.",
        });
      }
    }),
  },
});
