import { api } from "@/lib/api"

export interface DashboardStats {
  totalTickets: number
  openTickets: number
  resolvedByAiCount: number
  // Percentage (0–100) of all tickets the AI resolved; 0 when there are no tickets.
  resolvedByAiPercentage: number
  // Mean creation-to-resolution time in milliseconds across resolved tickets, or
  // null when nothing has been resolved yet.
  averageResolutionMs: number | null
  // Tickets created per calendar day over the last 30 days, oldest first. Every
  // day in the window is present; days with no tickets have count 0.
  ticketsPerDay: TicketsPerDay[]
}

// One day's ticket-creation count. `date` is a local `YYYY-MM-DD` key.
export interface TicketsPerDay {
  date: string
  count: number
}

export const dashboardStatsQueryKey = ["dashboard", "stats"] as const

export function fetchDashboardStats() {
  return api.get<DashboardStats>("/api/dashboard").then((res) => res.data)
}

// Formats a duration in milliseconds as a compact, human-readable string (e.g.
// "2d 3h", "45m", "12s"), used for the average-resolution-time stat.
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
