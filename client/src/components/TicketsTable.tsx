import { useNavigate } from "react-router"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

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
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}

const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  [TicketStatus.new]: "default",
  [TicketStatus.processing]: "outline",
  [TicketStatus.open]: "default",
  [TicketStatus.resolved]: "secondary",
  [TicketStatus.closed]: "outline",
}

const columnHelper = createColumnHelper<Ticket>()

const columns = [
  columnHelper.accessor("subject", {
    header: "Subject",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("senderEmail", {
    header: "Sender",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue()
      return <Badge variant={statusVariant[status]}>{ticketStatusLabels[status]}</Badge>
    },
  }),
  columnHelper.accessor("category", {
    header: "Category",
    cell: (info) => {
      const category = info.getValue()
      return category ? ticketCategoryLabels[category] : "Uncategorized"
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
]

// Subject/sender are free-form real-world text with no natural length cap
// (long subject lines, full email addresses). Under the browser's default
// table layout, a column grows to fit its longest line, which pushes the
// table wider than its container and forces horizontal scrolling. Pairing a
// fixed table layout with explicit per-column widths keeps every column
// within its share of the table regardless of content length; `truncate`
// then clips the two unbounded columns with an ellipsis instead of wrapping
// or overflowing.
const columnWidthClasses: Record<string, string> = {
  subject: "w-[30%]",
  senderEmail: "w-[20%]",
  status: "w-[12%]",
  category: "w-[18%]",
  createdAt: "w-[18%]",
}

const truncatedColumns = new Set(["subject", "senderEmail"])

const sortIcons = {
  asc: ArrowUp,
  desc: ArrowDown,
} as const

const ariaSortMap = {
  asc: "ascending",
  desc: "descending",
} as const

// Stable reference: `tickets ?? []` would allocate a new array every render
// while the query is pending (tickets is undefined), and TanStack Table's
// internal memoization treats a new `data` reference as a real data change
// every time. That retriggers the table's internal row-model recomputation
// each render, which schedules another render, which allocates another new
// array — an infinite synchronous loop that never yields back to the event
// loop, so the in-flight fetch's `.then()` never gets a chance to run.
const EMPTY_TICKETS: Ticket[] = []

function TicketsTable({
  tickets,
  isPending,
  isError,
  sorting,
  onSortingChange,
}: TicketsTableProps) {
  const navigate = useNavigate()

  const table = useReactTable({
    data: tickets ?? EMPTY_TICKETS,
    columns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
    enableMultiSort: false,
    sortDescFirst: false,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {isError && (
        <p className="p-6 text-sm text-red-600">Failed to load tickets</p>
      )}

      {(isPending || tickets) && (
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted()
                  const SortIcon = sortDirection ? sortIcons[sortDirection] : ChevronsUpDown

                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sortDirection ? ariaSortMap[sortDirection] : "none"}
                      className={columnWidthClasses[header.column.id]}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon aria-hidden="true" className="size-3.5" />
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
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

            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/tickets/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={truncatedColumns.has(cell.column.id) ? "truncate" : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export default TicketsTable
