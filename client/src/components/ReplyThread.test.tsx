import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { TicketStatus, TicketCategory, type Ticket } from "@/lib/tickets"
import ReplyThread from "./ReplyThread"

// Stub only the network client. `fetchReplies` from `@/lib/tickets` stays real
// and calls this mocked `api.get`, so we exercise the component's actual query.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: vi.fn() },
}))

const mockGet = vi.mocked(api.get)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const ticket: Ticket = {
  id: "ticket-1",
  subject: "Can't log in",
  body: "I forgot my password.",
  senderEmail: "customer@example.com",
  status: TicketStatus.open,
  category: TicketCategory.technicalQuestion,
  assignedTo: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
}

const replies = [
  {
    id: "reply-1",
    ticketId: "ticket-1",
    authorId: "agent-1",
    author: { id: "agent-1", name: "Alice Agent" },
    body: "Have you tried resetting your password?",
    createdAt: "2024-01-16T09:30:00.000Z",
  },
  {
    id: "reply-2",
    ticketId: "ticket-1",
    authorId: "agent-2",
    author: { id: "agent-2", name: "Bob Agent" },
    body: "Line one\nLine two",
    createdAt: "2024-01-17T14:00:00.000Z",
  },
]

describe("ReplyThread", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it("fetches replies from the ticket's replies endpoint", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    renderWithQuery(<ReplyThread ticket={ticket} />)

    expect(mockGet).toHaveBeenCalledWith("/api/tickets/ticket-1/replies")
  })

  it("shows skeleton placeholders while the request is pending", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    const { container } = renderWithQuery(<ReplyThread ticket={ticket} />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderWithQuery(<ReplyThread ticket={ticket} />)

    expect(await screen.findByText("Failed to load replies")).toBeInTheDocument()
  })

  it("shows an empty state when there are no replies", async () => {
    mockGet.mockResolvedValue({ data: [] })

    renderWithQuery(<ReplyThread ticket={ticket} />)

    expect(await screen.findByText("No replies yet.")).toBeInTheDocument()
  })

  it("renders each reply's author, body, and timestamp", async () => {
    mockGet.mockResolvedValue({ data: replies })

    renderWithQuery(<ReplyThread ticket={ticket} />)

    expect(
      await screen.findByText("Have you tried resetting your password?")
    ).toBeInTheDocument()
    expect(screen.getByText("Alice Agent")).toBeInTheDocument()
    expect(screen.getByText("Bob Agent")).toBeInTheDocument()

    // The timestamp is locale-formatted the same way the component does it, so
    // the assertion doesn't depend on the machine's locale.
    expect(
      screen.getByText(new Date(replies[0].createdAt).toLocaleString())
    ).toBeInTheDocument()
  })

  it("renders one list item per reply", async () => {
    mockGet.mockResolvedValue({ data: replies })

    renderWithQuery(<ReplyThread ticket={ticket} />)

    await screen.findByText("Have you tried resetting your password?")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("does not show the empty state once replies have loaded", async () => {
    mockGet.mockResolvedValue({ data: replies })

    renderWithQuery(<ReplyThread ticket={ticket} />)

    await screen.findByText("Have you tried resetting your password?")
    expect(screen.queryByText("No replies yet.")).not.toBeInTheDocument()
  })
})
