import { useQuery } from "@tanstack/react-query"

import TicketsTable from "@/components/TicketsTable"
import { fetchTickets, ticketsQueryKey } from "@/lib/tickets"

function Tickets() {
  const {
    data: tickets,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketsQueryKey,
    queryFn: fetchTickets,
    refetchInterval: 15000,
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Tickets
      </h1>

      <TicketsTable tickets={tickets} isPending={isPending} isError={isError} />
    </div>
  )
}

export default Tickets
