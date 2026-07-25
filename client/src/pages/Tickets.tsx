import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SortingState } from "@tanstack/react-table"

import TicketsFilterBar from "@/components/TicketsFilterBar"
import TicketsTable from "@/components/TicketsTable"
import {
  fetchTickets,
  ticketsQueryKey,
  TicketSortField,
  type TicketsFilters,
  type TicketsQuery,
  type TicketsSort,
} from "@/lib/tickets"

const defaultSort: TicketsSort = {
  sortBy: TicketSortField.createdAt,
  sortOrder: "desc",
}

const SEARCH_DEBOUNCE_MS = 300

function Tickets() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: TicketSortField.createdAt, desc: true },
  ])
  const [filters, setFilters] = useState<TicketsFilters>({})
  const [searchInput, setSearchInput] = useState("")

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim() || undefined }))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const activeSort = sorting[0]
  const sort: TicketsSort = activeSort
    ? {
        sortBy: activeSort.id as TicketSortField,
        sortOrder: activeSort.desc ? "desc" : "asc",
      }
    : defaultSort

  const query: TicketsQuery = { ...sort, ...filters }

  const {
    data: tickets,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketsQueryKey(query),
    queryFn: () => fetchTickets(query),
    refetchInterval: 15000,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Tickets
      </h1>

      <TicketsFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onStatusChange={(status) => setFilters((prev) => ({ ...prev, status }))}
        onCategoryChange={(category) => setFilters((prev) => ({ ...prev, category }))}
      />

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
