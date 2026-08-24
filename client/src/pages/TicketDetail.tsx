import { Link, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchTicket,
  fetchTicketAgents,
  TicketCategory,
  ticketAgentsQueryKey,
  ticketCategoryLabels,
  ticketQueryKey,
  TicketStatus,
  ticketStatusLabels,
  updateTicket,
  type TicketUpdate,
} from "@/lib/tickets"

const UNASSIGNED = "unassigned"
const UNCATEGORIZED = "uncategorized"

const statusItems = Object.values(TicketStatus).map((status) => ({
  value: status,
  label: ticketStatusLabels[status],
}))

const categoryItems = [
  { value: UNCATEGORIZED, label: "Uncategorized" },
  ...Object.values(TicketCategory).map((category) => ({
    value: category,
    label: ticketCategoryLabels[category],
  })),
]

function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const {
    data: ticket,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketQueryKey(id!),
    queryFn: () => fetchTicket(id!),
    enabled: Boolean(id),
  })

  const { data: agents } = useQuery({
    queryKey: ticketAgentsQueryKey,
    queryFn: fetchTicketAgents,
  })

  const { mutate: update, isPending: isUpdating } = useMutation({
    mutationFn: (data: TicketUpdate) => updateTicket(id!, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(ticketQueryKey(id!), updated)
    },
  })

  const agentItems = [
    { value: UNASSIGNED, label: "Unassigned" },
    ...(agents ?? []).map((agent) => ({ value: agent.id, label: agent.name })),
  ]

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
          <Card className="md:col-span-2">
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

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">Status</span>
                <Select
                  items={statusItems}
                  value={ticket.status}
                  disabled={isUpdating}
                  onValueChange={(value) => update({ status: value as TicketStatus })}
                >
                  <SelectTrigger aria-label="Status" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">Category</span>
                <Select
                  items={categoryItems}
                  value={ticket.category ?? UNCATEGORIZED}
                  disabled={isUpdating}
                  onValueChange={(value) =>
                    update({
                      category: value === UNCATEGORIZED ? null : (value as TicketCategory),
                    })
                  }
                >
                  <SelectTrigger aria-label="Category" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">Assigned to</span>
                <Select
                  items={agentItems}
                  value={ticket.assignedTo ?? UNASSIGNED}
                  disabled={isUpdating}
                  onValueChange={(value) =>
                    update({ assignedTo: value === UNASSIGNED ? null : (value as string) })
                  }
                >
                  <SelectTrigger aria-label="Assigned to" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agentItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default TicketDetail
