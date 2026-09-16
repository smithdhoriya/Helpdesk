import { useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { SortingState } from "@tanstack/react-table"

import TicketsFilterBar from "@/components/TicketsFilterBar"
import TicketsPagination from "@/components/TicketsPagination"
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
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim() || undefined }))
      setPage(1)
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

  const query: TicketsQuery = { ...sort, ...filters, page }

  const {
    data,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketsQueryKey(query),
    queryFn: () => fetchTickets(query),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Tickets
      </h1>

      <TicketsFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onStatusChange={(status) => {
          setFilters((prev) => ({ ...prev, status }))
          setPage(1)
        }}
        onCategoryChange={(category) => {
          setFilters((prev) => ({ ...prev, category }))
          setPage(1)
        }}
        onResolvedByAiChange={(resolvedByAi) => {
          // Only carry the flag when opting in, so the default query key stays
          // clean and the server applies its default (AI-resolved hidden).
          setFilters((prev) => ({ ...prev, resolvedByAi: resolvedByAi || undefined }))
          setPage(1)
        }}
      />

      <TicketsTable
        tickets={data?.tickets}
        isPending={isPending}
        isError={isError}
        sorting={sorting}
        onSortingChange={(updater) => {
          setSorting(updater)
          setPage(1)
        }}
      />

      {data && (
        <TicketsPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}

export default Tickets
