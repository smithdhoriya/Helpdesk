import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

interface TicketsPaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

function TicketsPagination({ page, pageSize, total, onPageChange }: TicketsPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <p>
        Showing {rangeStart}-{rangeEnd} of {total}
      </p>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
          Previous
        </Button>
        <span>
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export default TicketsPagination
