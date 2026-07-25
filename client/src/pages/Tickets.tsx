import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SortingState } from "@tanstack/react-table"

import TicketsTable from "@/components/TicketsTable"
import {
  fetchTickets,
  ticketsQueryKey,
  TicketSortField,
  type TicketsSort,
} from "@/lib/tickets"

const defaultSort: TicketsSort = {
  sortBy: TicketSortField.createdAt,
  sortOrder: "desc",
}

function Tickets() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: TicketSortField.createdAt, desc: true },
  ])

  const activeSort = sorting[0]
  const sort: TicketsSort = activeSort
    ? {
        sortBy: activeSort.id as TicketSortField,
        sortOrder: activeSort.desc ? "desc" : "asc",
      }
    : defaultSort

  const {
    data: tickets,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketsQueryKey(sort),
    queryFn: () => fetchTickets(sort),
    refetchInterval: 15000,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Tickets
      </h1>

      <TicketsTable
        tickets={tickets}
        isPending={isPending}
        isError={isError}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    </div>
  )
}

export default Tickets
