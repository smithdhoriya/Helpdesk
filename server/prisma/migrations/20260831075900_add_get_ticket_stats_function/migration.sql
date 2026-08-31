-- Returns a single row of headline ticket metrics as a typed table, for use in
-- reporting queries and joins (e.g. `SELECT * FROM get_ticket_stats()`).
--
-- Column names are quoted camelCase to match how the API/client refer to them:
--   totalTickets          — every ticket, regardless of status.
--   openTickets           — tickets currently `open` (awaiting a human).
--   resolvedByAi          — tickets the AI auto-resolved from the knowledge base.
--   aiResolutionRate      — resolvedByAi as a percentage of all tickets (0 when
--                           there are none, so it never divides by zero).
--   averageResolutionTime — mean creation-to-resolution time across resolved
--                           tickets (`updatedAt - createdAt`), in milliseconds;
--                           NULL when none have been resolved yet. Milliseconds
--                           (not an interval) so it round-trips through Prisma's
--                           pg adapter, which can't decode the interval type.
--
-- Dropped first because CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS get_ticket_stats();

CREATE FUNCTION get_ticket_stats()
RETURNS TABLE (
  "totalTickets"          integer,
  "openTickets"           integer,
  "resolvedByAi"          integer,
  "aiResolutionRate"      double precision,
  "averageResolutionTime" double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    count(*)::int                                    AS "totalTickets",
    (count(*) FILTER (WHERE "status" = 'open'))::int AS "openTickets",
    (count(*) FILTER (WHERE "resolvedByAi"))::int    AS "resolvedByAi",
    CASE
      WHEN count(*) = 0 THEN 0
      ELSE (count(*) FILTER (WHERE "resolvedByAi")::double precision / count(*)) * 100
    END                                              AS "aiResolutionRate",
    avg(extract(epoch FROM ("updatedAt" - "createdAt")) * 1000)
      FILTER (WHERE "status" = 'resolved')           AS "averageResolutionTime"
  FROM "ticket";
$$;
