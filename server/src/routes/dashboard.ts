import { Router } from "express";

import { prisma } from "../db";

export const dashboardRouter = Router();

// How many days of daily ticket counts the chart covers (inclusive of today).
// Kept in sync with the `window_days` default of the `dashboard_stats` SQL function.
const TICKETS_PER_DAY_WINDOW = 30;

// The server's IANA timezone, passed to the SQL function so it buckets tickets by
// the same local calendar day the app runs in, wherever PostgreSQL itself lives.
const SERVER_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// Shape returned by the `dashboard_stats` database function (see the migration
// `20260831060000_add_dashboard_stats_function`); mirrors `DashboardStats` on the
// client. All aggregation happens in the database in a single round-trip.
interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedByAiCount: number;
  resolvedByAiPercentage: number;
  averageResolutionMs: number | null;
  ticketsPerDay: { date: string; count: number }[];
}

/**
 * Aggregate ticket metrics for the dashboard. The computation lives in the
 * `dashboard_stats(tz, window_days)` PL/pgSQL function, which returns the full
 * payload as a single JSON value:
 *
 * - `totalTickets`           — every ticket, regardless of status.
 * - `openTickets`            — tickets currently `open` (awaiting a human).
 * - `resolvedByAiCount`      — tickets the AI auto-resolved from the knowledge base.
 * - `resolvedByAiPercentage` — that count as a percentage of all tickets (0 when
 *   there are no tickets, so it never divides by zero).
 * - `averageResolutionMs`    — mean time from creation to resolution across resolved
 *   tickets (`updatedAt - createdAt`); `null` when nothing has been resolved yet.
 * - `ticketsPerDay`          — tickets created per day over the last 30 days, one
 *   entry per calendar day (days with no tickets included with `count: 0`).
 */
dashboardRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRaw<{ stats: DashboardStats }[]>`
    SELECT dashboard_stats(${SERVER_TIMEZONE}, ${TICKETS_PER_DAY_WINDOW}) AS stats
  `;

  res.json(rows[0].stats);
});
