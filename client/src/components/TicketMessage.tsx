import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type Ticket } from "@/lib/tickets"

interface TicketMessageProps {
  ticket: Ticket
}

function TicketMessage({ ticket }: TicketMessageProps) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1.5">
          <CardTitle className="text-xl">{ticket.subject}</CardTitle>
          <p className="text-sm text-gray-600">From {ticket.senderEmail}</p>
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
  )
}

export default TicketMessage
