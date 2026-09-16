import { useQuery } from "@tanstack/react-query"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchReplies, ticketRepliesQueryKey, type Ticket } from "@/lib/tickets"

interface ReplyThreadProps {
  ticket: Ticket
}

function ReplyThread({ ticket }: ReplyThreadProps) {
  const {
    data: replies,
    isPending,
    isError,
  } = useQuery({
    queryKey: ticketRepliesQueryKey(ticket.id),
    queryFn: () => fetchReplies(ticket.id),
  })

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (isError) {
    return <p className="text-sm text-destructive">Failed to load replies</p>
  }

  if (replies.length === 0) {
    return <p className="text-sm text-muted-foreground">No replies yet.</p>
  }

  return (
    <ul className="space-y-3">
      {replies.map((reply) => (
        <li key={reply.id} className="rounded-lg border border-border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {/* AI-authored auto-resolutions have no human author; label them
                  as the assistant rather than showing a blank name. */}
              {reply.isAi ? "AI Assistant" : reply.author?.name ?? "Unknown"}
              {reply.isAi && <Badge variant="secondary">AI</Badge>}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(reply.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {reply.body}
          </p>
        </li>
      ))}
    </ul>
  )
}

export default ReplyThread
