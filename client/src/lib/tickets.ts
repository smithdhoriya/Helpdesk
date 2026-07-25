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
  senderEmail: string
  status: TicketStatus
  category: TicketCategory | null
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

export const ticketsQueryKey = ["tickets"] as const
export const ticketQueryKey = (id: string) => ["tickets", id] as const

export function fetchTickets() {
  return api.get<Ticket[]>("/api/tickets").then((res) => res.data)
}

export function fetchTicket(id: string) {
  return api.get<Ticket>(`/api/tickets/${id}`).then((res) => res.data)
}
