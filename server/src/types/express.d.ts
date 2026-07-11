import type { auth } from "../auth";

type AuthSession = typeof auth.$Infer.Session;

declare global {
  namespace Express {
    interface Request {
      session?: AuthSession["session"];
      user?: AuthSession["user"];
    }
  }
}

export {};
