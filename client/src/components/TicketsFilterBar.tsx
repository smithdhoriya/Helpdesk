import { Search } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import SelectField from "@/components/SelectField"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  onResolvedByAiChange: (resolvedByAi: boolean) => void
}

function TicketsFilterBar({
  filters,
  searchInput,
  onSearchInputChange,
  onStatusChange,
  onCategoryChange,
  onResolvedByAiChange,
}: TicketsFilterBarProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="relative w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder="Search subject or sender..."
          className="pl-8"
          aria-label="Search tickets"
        />
      </div>

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

      <Label className="ml-auto flex items-center gap-2 text-sm font-normal text-foreground">
        <Checkbox
          checked={filters.resolvedByAi ?? false}
          onCheckedChange={(checked) => onResolvedByAiChange(checked === true)}
        />
        Show AI-resolved
      </Label>
    </div>
  )
}

export default TicketsFilterBar
