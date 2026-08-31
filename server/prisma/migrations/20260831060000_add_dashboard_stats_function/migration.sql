-- Computes every dashboard metric in a single database round-trip, returning the
-- exact shape the API serves (see `DashboardStats` in client/src/lib/dashboard.ts).
--
-- `tz` is an IANA timezone name (e.g. 'America/New_York'); the API passes the
-- server's own timezone so day bucketing matches what the JS aggregation used to
-- do regardless of where PostgreSQL runs. `window_days` is the ticketsPerDay
-- window, inclusive of today.
--
-- Ticket timestamps are `timestamp` (no zone) storing UTC, so we tag them UTC and
-- convert into `tz` before truncating to a local calendar day.
CREATE OR REPLACE FUNCTION dashboard_stats(tz text DEFAULT 'UTC', window_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  total_tickets          bigint;
  open_tickets           bigint;
  resolved_by_ai_count   bigint;
  resolved_by_ai_pct     double precision;
  avg_resolution_ms      double precision;
  window_start           date;
  tickets_per_day        jsonb;
BEGIN
  -- Today's local date in `tz`, minus (window_days - 1): the inclusive window start.
  window_start := (now() AT TIME ZONE tz)::date - (window_days - 1);

  SELECT count(*)                                     INTO total_tickets        FROM "ticket";
  SELECT count(*)                                     INTO open_tickets         FROM "ticket" WHERE "status" = 'open';
  SELECT count(*)                                     INTO resolved_by_ai_count FROM "ticket" WHERE "resolvedByAi" = true;

  resolved_by_ai_pct :=
    CASE WHEN total_tickets = 0 THEN 0
         ELSE (resolved_by_ai_count::double precision / total_tickets) * 100
    END;

  -- Mean creation-to-resolution time, in ms; NULL (→ JSON null) when none resolved.
  SELECT avg(extract(epoch FROM ("updatedAt" - "createdAt")) * 1000)
    INTO avg_resolution_ms
    FROM "ticket"
   WHERE "status" = 'resolved';

  -- One entry per calendar day across the window, oldest first, zero-count days
  -- included: a generated day series LEFT JOINed onto per-day ticket counts.
  SELECT jsonb_agg(
           jsonb_build_object(
             'date',  to_char(d.day, 'YYYY-MM-DD'),
             'count', coalesce(c.cnt, 0)
           )
           ORDER BY d.day
         )
    INTO tickets_per_day
    FROM generate_series(
           window_start::timestamp,
           (window_start + (window_days - 1))::timestamp,
           interval '1 day'
         ) AS d(day)
    LEFT JOIN (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE tz)::date AS day,
             count(*) AS cnt
        FROM "ticket"
       WHERE (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE tz)::date >= window_start
       GROUP BY 1
    ) c ON c.day = d.day::date;

  RETURN jsonb_build_object(
    'totalTickets',           total_tickets,
    'openTickets',            open_tickets,
    'resolvedByAiCount',      resolved_by_ai_count,
    'resolvedByAiPercentage', resolved_by_ai_pct,
    'averageResolutionMs',    avg_resolution_ms,
    'ticketsPerDay',          coalesce(tickets_per_day, '[]'::jsonb)
  );
END;
$$;
