import type { auth } from "../auth";

type AuthSession = typeof auth.$Infer.Session;

declare global {
  namespace Express {
    interface Request {
      session?: AuthSession["session"];
      user?: AuthSession["user"];
      /** Raw JSON body bytes, captured by express.json()'s `verify` option for webhook signature verification (see routes/webhooks.ts). */
      rawBody?: Buffer;
    }
  }
}

export {};
