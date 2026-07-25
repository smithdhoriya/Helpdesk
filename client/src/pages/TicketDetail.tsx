import { useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchTicket,
  ticketCategoryLabels,
  ticketQueryKey,
  ticketStatusLabels,
} from "@/lib/tickets"

function TicketDetail() {
  const { id } = useParams<{ id: string }>()

  const {
    data: ticket,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketQueryKey(id!),
    queryFn: () => fetchTicket(id!),
    enabled: Boolean(id),
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {isError && <p className="text-sm text-red-600">Failed to load ticket</p>}

      {isPending && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {ticket && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{ticket.subject}</CardTitle>
              <Badge>{ticketStatusLabels[ticket.status]}</Badge>
            </div>
            <p className="text-sm text-gray-600">From {ticket.senderEmail}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              {ticket.category
                ? ticketCategoryLabels[ticket.category]
                : "Uncategorized"}
            </p>
            <p className="whitespace-pre-wrap text-sm text-gray-900">
              {ticket.body}
            </p>
            <p className="text-xs text-gray-400">
              Created {new Date(ticket.createdAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default TicketDetail
