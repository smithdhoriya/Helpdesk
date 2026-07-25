import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
      <Button variant="link" className="h-auto gap-1 p-0" render={<Link to="/tickets" />}>
        ← Back to Tickets
      </Button>

      {isError && <p className="mt-6 text-sm text-red-600">Failed to load ticket</p>}

      {isPending && (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {ticket && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle className="text-xl">{ticket.subject}</CardTitle>
                <p className="text-sm text-gray-600">From {ticket.senderEmail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge>{ticketStatusLabels[ticket.status]}</Badge>
                <Badge variant="outline">
                  {ticket.category
                    ? ticketCategoryLabels[ticket.category]
                    : "Uncategorized"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Message</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-900">
                {ticket.body}
              </p>
            </div>
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
