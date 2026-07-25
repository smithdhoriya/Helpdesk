import { useNavigate } from "react-router"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
  type Ticket,
} from "@/lib/tickets"

interface TicketsTableProps {
  tickets: Ticket[] | undefined
  isPending: boolean
  isError: boolean
}

const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  [TicketStatus.open]: "default",
  [TicketStatus.resolved]: "secondary",
  [TicketStatus.closed]: "outline",
}

function TicketsTable({ tickets, isPending, isError }: TicketsTableProps) {
  const navigate = useNavigate()

  
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {isError && (
        <p className="p-6 text-sm text-red-600">Failed to load tickets</p>
      )}

      {(isPending || tickets) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))}

            {tickets?.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => navigate(`/tickets/${ticket.id}`)}
              >
                <TableCell>{ticket.subject}</TableCell>
                <TableCell>{ticket.senderEmail}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[ticket.status]}>
                    {ticketStatusLabels[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {ticket.category
                    ? ticketCategoryLabels[ticket.category]
                    : "Uncategorized"}
                </TableCell>
                <TableCell>
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export default TicketsTable
