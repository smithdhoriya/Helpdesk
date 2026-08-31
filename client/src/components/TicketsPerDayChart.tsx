import { useMemo } from "react"

import type { TicketsPerDay } from "@/lib/dashboard"

interface TicketsPerDayChartProps {
  data: TicketsPerDay[]
}

// Parse a `YYYY-MM-DD` key into a local Date (not UTC), so labels never shift a
// day in negative timezones the way `new Date("2026-08-31")` would.
function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDayLabel(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

// A dependency-free bar chart: each day is a flex column whose filled portion is
// a percentage of the busiest day, so bars scale to the data without a charting
// library. Non-zero days get a small minimum height so a single ticket is still
// visible next to a busy day; zero-count days render just the baseline track,
// keeping the 30-day axis contiguous.
function TicketsPerDayChart({ data }: TicketsPerDayChartProps) {
  const maxCount = useMemo(
    () => data.reduce((max, day) => Math.max(max, day.count), 0),
    [data],
  )

  return (
    <div className="w-full">
      <div
        className="flex h-56 items-end gap-1 border-b border-gray-200"
        role="img"
        aria-label="Tickets created per day over the last 30 days"
      >
        {data.map((day) => {
          const heightPercent =
            maxCount === 0 ? 0 : (day.count / maxCount) * 100
          const label = `${formatDayLabel(day.date)}: ${day.count} ${
            day.count === 1 ? "ticket" : "tickets"
          }`

          return (
            <div
              key={day.date}
              className="group flex h-full flex-1 flex-col justify-end"
              title={label}
            >
              <div
                className="min-h-[2px] rounded-t bg-blue-500 transition-[height] group-hover:bg-blue-600"
                style={{
                  height: day.count === 0 ? "0%" : `${Math.max(heightPercent, 4)}%`,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* A sparse axis: labelling all 30 days would overlap, so show the first,
          last, and roughly every fifth day, evenly spaced under the bars. */}
      <div className="mt-2 flex gap-1 text-xs text-gray-500">
        {data.map((day, index) => {
          const showLabel = index % 5 === 0 || index === data.length - 1
          return (
            <div key={day.date} className="flex-1 text-center">
              {showLabel ? formatDayLabel(day.date) : ""}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TicketsPerDayChart
