import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ReplyForm from "@/components/ReplyForm"
import ReplyThread from "@/components/ReplyThread"
import { Skeleton } from "@/components/ui/skeleton"
import TicketMessage from "@/components/TicketMessage"
import TicketSummary from "@/components/TicketSummary"
import UpdateTicket from "@/components/UpdateTicket"
import { fetchTicket, ticketQueryKey } from "@/lib/tickets"

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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            <TicketMessage ticket={ticket} />

            <TicketSummary ticket={ticket} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Replies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ReplyThread ticket={ticket} />
                <ReplyForm ticket={ticket} />
              </CardContent>
            </Card>
          </div>

          <UpdateTicket ticket={ticket} />
        </div>
      )}
    </div>
  )
}

export default TicketDetail
