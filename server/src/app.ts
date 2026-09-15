import cors from "cors";
import express from "express";
import * as Sentry from "@sentry/bun";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { requireAdmin } from "./middleware/require-admin";
import { requireAuth } from "./middleware/require-auth";
import { dashboardRouter } from "./routes/dashboard";
import { ticketsRouter } from "./routes/tickets";
import { usersRouter } from "./routes/users";
import { webhooksRouter } from "./routes/webhooks";

export const app = express();

app.use(cors({ origin: process.env.TRUSTED_ORIGIN!, credentials: true }));

app.all("/api/auth/*", toNodeHandler(auth));

// Mounted after the Better Auth handler so its own body parsing isn't interfered with.
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Helpdesk API" });
});

app.use("/api/users", requireAuth, requireAdmin, usersRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/tickets", requireAuth, ticketsRouter);

// Registered after all routes and before any other error-handling middleware.
Sentry.setupExpressErrorHandler(app);
