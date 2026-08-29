import SelectField from "@/components/SelectField"
import { Input } from "@/components/ui/input"
import {
  TicketCategory,
  TicketStatus,
  ticketCategoryLabels,
  ticketStatusLabels,
  type TicketsFilters,
} from "@/lib/tickets"

const ALL_STATUSES = "all"
const ALL_CATEGORIES = "all"

const statusItems = [
  { value: ALL_STATUSES, label: "All statuses" },
  ...Object.values(TicketStatus).map((value) => ({
    value,
    label: ticketStatusLabels[value],
  })),
]

const categoryItems = [
  { value: ALL_CATEGORIES, label: "All categories" },
  ...Object.values(TicketCategory).map((value) => ({
    value,
    label: ticketCategoryLabels[value],
  })),
  { value: "uncategorized", label: "Uncategorized" },
]

interface TicketsFilterBarProps {
  filters: TicketsFilters
  searchInput: string
  onSearchInputChange: (search: string) => void
  onStatusChange: (status: TicketStatus | undefined) => void
  onCategoryChange: (category: TicketsFilters["category"]) => void
}

function TicketsFilterBar({
  filters,
  searchInput,
  onSearchInputChange,
  onStatusChange,
  onCategoryChange,
}: TicketsFilterBarProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Input
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
        placeholder="Search subject or sender..."
        className="w-64"
        aria-label="Search tickets"
      />

      <SelectField
        items={statusItems}
        value={filters.status ?? ALL_STATUSES}
        label="Filter by status"
        onValueChange={(value) =>
          onStatusChange(value === ALL_STATUSES ? undefined : (value as TicketStatus))
        }
      />

      <SelectField
        items={categoryItems}
        value={filters.category ?? ALL_CATEGORIES}
        label="Filter by category"
        onValueChange={(value) =>
          onCategoryChange(
            value === ALL_CATEGORIES ? undefined : (value as TicketsFilters["category"])
          )
        }
      />
    </div>
  )
}

export default TicketsFilterBar
