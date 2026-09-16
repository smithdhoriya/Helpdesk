import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleDot, Tag, User } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SelectField from "@/components/SelectField"
import {
  fetchTicketAgents,
  TicketCategory,
  ticketAgentsQueryKey,
  ticketCategoryLabels,
  ticketQueryKey,
  TicketStatus,
  ticketStatusLabels,
  UNCATEGORIZED_LABEL,
  updateTicket,
  type Ticket,
  type TicketUpdate,
} from "@/lib/tickets"

const UNASSIGNED = "unassigned"
const UNCATEGORIZED = "uncategorized"

const statusItems = Object.values(TicketStatus).map((status) => ({
  value: status,
  label: ticketStatusLabels[status],
}))

const categoryItems = [
  { value: UNCATEGORIZED, label: UNCATEGORIZED_LABEL },
  ...Object.values(TicketCategory).map((category) => ({
    value: category,
    label: ticketCategoryLabels[category],
  })),
]

interface UpdateTicketProps {
  ticket: Ticket
}

function UpdateTicket({ ticket }: UpdateTicketProps) {
  const queryClient = useQueryClient()

  const { data: agents } = useQuery({
    queryKey: ticketAgentsQueryKey,
    queryFn: fetchTicketAgents,
  })

  const { mutate: update, isPending: isUpdating } = useMutation({
    mutationFn: (data: TicketUpdate) => updateTicket(ticket.id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(ticketQueryKey(ticket.id), updated)
    },
  })

  const agentItems = [
    { value: UNASSIGNED, label: "Unassigned" },
    ...(agents ?? []).map((agent) => ({ value: agent.id, label: agent.name })),
  ]

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CircleDot aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Status
          </span>
          <SelectField
            items={statusItems}
            value={ticket.status}
            label="Status"
            size="sm"
            className="w-full"
            disabled={isUpdating}
            onValueChange={(value) => update({ status: value as TicketStatus })}
          />
        </div>

        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Tag aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Category
          </span>
          <SelectField
            items={categoryItems}
            value={ticket.category ?? UNCATEGORIZED}
            label="Category"
            size="sm"
            className="w-full"
            disabled={isUpdating}
            onValueChange={(value) =>
              update({
                category: value === UNCATEGORIZED ? null : (value as TicketCategory),
              })
            }
          />
        </div>

        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <User aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Assigned to
          </span>
          <SelectField
            items={agentItems}
            value={ticket.assignedTo ?? UNASSIGNED}
            label="Assigned to"
            size="sm"
            className="w-full"
            disabled={isUpdating}
            onValueChange={(value) =>
              update({ assignedTo: value === UNASSIGNED ? null : (value as string) })
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

export default UpdateTicket
