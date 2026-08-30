import { useMutation } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { getApiErrorMessage } from "@/lib/api"
import { summarizeTicket, type Ticket } from "@/lib/tickets"

interface TicketSummaryProps {
  ticket: Ticket
}

function TicketSummary({ ticket }: TicketSummaryProps) {
  // A mutation, not a query: the summary is regenerated on every click and
  // never cached, so the agent always gets a fresh read of the latest thread.
  const mutation = useMutation({
    mutationFn: () => summarizeTicket(ticket.id),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Summary</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Sparkles aria-hidden="true" className="size-4" />
            {mutation.isPending ? "Summarizing..." : "Summarize"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mutation.isError && (
          <FieldError>
            {getApiErrorMessage(mutation.error, "Failed to summarize ticket")}
          </FieldError>
        )}
        {mutation.data ? (
          <p className="whitespace-pre-wrap text-sm text-gray-900">{mutation.data}</p>
        ) : (
          !mutation.isError && (
            <p className="text-sm text-gray-500">
              Generate an AI summary of this ticket and its conversation.
            </p>
          )
        )}
      </CardContent>
    </Card>
  )
}

export default TicketSummary
