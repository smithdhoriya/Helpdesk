import { useQuery } from "@tanstack/react-query"
import { Clock, Percent, Sparkles, Ticket, CircleDot, type LucideIcon } from "lucide-react"

import TicketsPerDayChart from "@/components/TicketsPerDayChart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  dashboardStatsQueryKey,
  fetchDashboardStats,
  formatDuration,
  type DashboardStats,
} from "@/lib/dashboard"

// The stat cards, declared as data so the grid stays a single map. Each derives
// its display value from the fetched stats; `value` returns a string so
// formatting (percentages, durations, the "—" empty state) lives next to the
// label it belongs to. `tint` is a semantic pairing with the same colors used
// for status badges elsewhere (warning = needs attention, success = AI wins).
const stats: {
  label: string
  value: (s: DashboardStats) => string
  icon: LucideIcon
  tint: string
}[] = [
  {
    label: "Total tickets",
    value: (s) => String(s.totalTickets),
    icon: Ticket,
    tint: "bg-primary/10 text-primary",
  },
  {
    label: "Open tickets",
    value: (s) => String(s.openTickets),
    icon: CircleDot,
    tint: "bg-warning/10 text-warning-foreground",
  },
  {
    label: "Resolved by AI",
    value: (s) => String(s.resolvedByAiCount),
    icon: Sparkles,
    tint: "bg-success/10 text-success-foreground",
  },
  {
    label: "% resolved by AI",
    value: (s) => `${s.resolvedByAiPercentage.toFixed(1)}%`,
    icon: Percent,
    tint: "bg-success/10 text-success-foreground",
  },
  {
    label: "Avg. resolution time",
    value: (s) =>
      s.averageResolutionMs === null ? "—" : formatDuration(s.averageResolutionMs),
    icon: Clock,
    tint: "bg-muted text-muted-foreground",
  },
]

function Home() {
  const { data, isPending, isError } = useQuery({
    queryKey: dashboardStatsQueryKey,
    queryFn: fetchDashboardStats,
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Dashboard
      </h1>

      {isError && (
        <p className="mt-6 text-sm text-destructive">Failed to load dashboard stats</p>
      )}

      {!isError && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <Card key={stat.label} size="sm">
              <CardContent className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  {isPending || !data ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                      {stat.value(data)}
                    </p>
                  )}
                </div>
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md ${stat.tint}`}
                >
                  <stat.icon aria-hidden="true" className="size-4" />
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isError && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Tickets Per Day
            </CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {isPending || !data ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <TicketsPerDayChart data={data.ticketsPerDay} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default Home
