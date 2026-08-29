import { api } from "@/lib/api"

export const TicketStatus = {
  open: "open",
  resolved: "resolved",
  closed: "closed",
} as const

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]

export const ticketStatusLabels: Record<TicketStatus, string> = {
  [TicketStatus.open]: "Open",
  [TicketStatus.resolved]: "Resolved",
  [TicketStatus.closed]: "Closed",
}

export const TicketCategory = {
  generalQuestion: "generalQuestion",
  technicalQuestion: "technicalQuestion",
  refundRequest: "refundRequest",
} as const

export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory]

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.generalQuestion]: "General Question",
  [TicketCategory.technicalQuestion]: "Technical Question",
  [TicketCategory.refundRequest]: "Refund Request",
}

export type Ticket = {
  id: string
  subject: string
  body: string
  bodyHtml: string | null
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  assignedTo: string | null
  assignee?: Agent | null
  createdAt: string
  updatedAt: string
}

export type Agent = {
  id: string
  name: string
}

export const TicketSortField = {
  subject: "subject",
  senderEmail: "senderEmail",
  status: "status",
  category: "category",
  createdAt: "createdAt",
} as const

export type TicketSortField = (typeof TicketSortField)[keyof typeof TicketSortField]

export interface TicketsSort {
  sortBy: TicketSortField
  sortOrder: "asc" | "desc"
}

export interface TicketsFilters {
  status?: TicketStatus
  category?: TicketCategory | "uncategorized"
  search?: string
}

export interface TicketsPagination {
  page: number
}

export interface TicketsQuery extends TicketsSort, TicketsFilters, TicketsPagination {}

export interface TicketsPage {
  tickets: Ticket[]
  total: number
  page: number
  pageSize: number
}

export const ticketsQueryKey = (query: TicketsQuery) => ["tickets", query] as const
export const ticketQueryKey = (id: string) => ["tickets", id] as const
export const ticketAgentsQueryKey = ["tickets", "agents"] as const

export function fetchTickets(query: TicketsQuery) {
  return api
    .get<TicketsPage>("/api/tickets", { params: query })
    .then((res) => res.data)
}

export function fetchTicket(id: string) {
  return api.get<Ticket>(`/api/tickets/${id}`).then((res) => res.data)
}

export function fetchTicketAgents() {
  return api.get<Agent[]>("/api/tickets/agents").then((res) => res.data)
}

export interface TicketUpdate {
  status?: TicketStatus
  category?: TicketCategory | null
  assignedTo?: string | null
}

export function updateTicket(id: string, data: TicketUpdate) {
  return api
    .patch<Ticket>(`/api/tickets/${id}`, data)
    .then((res) => res.data)
}

export type Reply = {
  id: string
  ticketId: string
  authorId: string
  author: Agent
  body: string
  createdAt: string
}

export const ticketRepliesQueryKey = (ticketId: string) =>
  ["tickets", ticketId, "replies"] as const

export function fetchReplies(ticketId: string) {
  return api
    .get<Reply[]>(`/api/tickets/${ticketId}/replies`)
    .then((res) => res.data)
}

export function createReply(ticketId: string, body: string) {
  return api
    .post<Reply>(`/api/tickets/${ticketId}/replies`, { body })
    .then((res) => res.data)
}
