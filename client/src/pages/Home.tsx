import { useQuery } from "@tanstack/react-query"

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
// label it belongs to.
const stats: { label: string; value: (s: DashboardStats) => string }[] = [
  { label: "Total tickets", value: (s) => String(s.totalTickets) },
  { label: "Open tickets", value: (s) => String(s.openTickets) },
  { label: "Resolved by AI", value: (s) => String(s.resolvedByAiCount) },
  {
    label: "% resolved by AI",
    value: (s) => `${s.resolvedByAiPercentage.toFixed(1)}%`,
  },
  {
    label: "Avg. resolution time",
    value: (s) =>
      s.averageResolutionMs === null ? "—" : formatDuration(s.averageResolutionMs),
  },
]

function Home() {
  const { data, isPending, isError } = useQuery({
    queryKey: dashboardStatsQueryKey,
    queryFn: fetchDashboardStats,
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Dashboard
      </h1>

      {isError && (
        <p className="mt-6 text-sm text-red-600">Failed to load dashboard stats</p>
      )}

      {!isError && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-500">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isPending || !data ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-3xl font-semibold tracking-tight text-gray-900">
                    {stat.value(data)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isError && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-900">
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
