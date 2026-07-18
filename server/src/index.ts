import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth";
import { requireAdmin } from "./middleware/require-admin";
import { requireAuth } from "./middleware/require-auth";
import { usersRouter } from "./routes/users";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.TRUSTED_ORIGIN!, credentials: true }));

app.all("/api/auth/*", toNodeHandler(auth));

// Mounted after the Better Auth handler so its own body parsing isn't interfered with.
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Helpdesk API" });
});

app.use("/api/users", requireAuth, requireAdmin, usersRouter);

app.listen(PORT, () => {
  console.log(`Helpdesk server listening on http://localhost:${PORT}`);
});
