import { useMemo } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sanitizeTicketHtml } from "@/lib/sanitize-html"
import { type Ticket } from "@/lib/tickets"

interface TicketMessageProps {
  ticket: Ticket
}

function TicketMessage({ ticket }: TicketMessageProps) {
  const safeHtml = useMemo(() => {
    if (!ticket.bodyHtml) return null

    const clean = sanitizeTicketHtml(ticket.bodyHtml)
    // A message made up entirely of unsafe markup sanitizes down to nothing.
    // Fall back to the plain-text part rather than showing an empty message.
    return clean.trim() === "" ? null : clean
  }, [ticket.bodyHtml])

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
          {safeHtml === null ? (
            <p className="whitespace-pre-wrap text-sm text-gray-900">
              {ticket.body}
            </p>
          ) : (
            <div
              data-testid="ticket-body-html"
              className="text-sm text-gray-900 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
              // Sanitized by `sanitizeTicketHtml` immediately above — the raw
              // `bodyHtml` is attacker-controlled inbound email HTML and must
              // never reach this attribute unsanitized.
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          )}
        </div>
        <p className="text-xs text-gray-400">
          Created {new Date(ticket.createdAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  )
}

export default TicketMessage
