import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import {
  TicketStatus,
  TicketCategory,
  ticketStatusLabels,
  ticketCategoryLabels,
} from "@/lib/tickets"
import TicketDetail from "./TicketDetail"

function renderTicketDetail(id = "1") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)
const mockPost = vi.mocked(api.post)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const ticket = {
  id: "1",
  subject: "Can't log in",
  body: "I forgot my password.",
  bodyHtml: null,
  senderEmail: "customer@example.com",
  status: TicketStatus.open,
  category: TicketCategory.technicalQuestion,
  assignedTo: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
}

const agents = [
  { id: "agent-1", name: "Alice Agent" },
  { id: "agent-2", name: "Bob Agent" },
]

const replies = [
  {
    id: "reply-1",
    ticketId: "1",
    authorId: "agent-1",
    author: { id: "agent-1", name: "Alice Agent" },
    body: "Have you tried resetting your password?",
    createdAt: "2024-01-16T00:00:00.000Z",
  },
]

// The ticket, agents list, and replies are all fetched via the same mocked
// `api.get`, so responses are routed by URL to keep each test's intent readable.
function mockGetByUrl({
  ticket,
  agents: agentsData = agents,
  replies: repliesData = [],
}: {
  ticket: unknown
  agents?: unknown
  replies?: unknown
}) {
  mockGet.mockImplementation((url: unknown) => {
    if (url === "/api/tickets/agents") {
      return Promise.resolve({ data: agentsData })
    }
    if (typeof url === "string" && url.endsWith("/replies")) {
      return Promise.resolve({ data: repliesData })
    }
    return Promise.resolve({ data: ticket })
  })
}

describe("TicketDetail page", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPatch.mockReset()
    mockPost.mockReset()
  })

  it("shows skeleton placeholders while the request is pending", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    const { container } = renderTicketDetail()

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
  })

  it("renders the ticket once the request resolves", async () => {
    mockGetByUrl({ ticket })

    renderTicketDetail()

    expect(await screen.findByText("Can't log in")).toBeInTheDocument()
    expect(screen.getByText(ticketStatusLabels[TicketStatus.open])).toBeInTheDocument()
    expect(screen.getByText("From customer@example.com")).toBeInTheDocument()
    expect(
      screen.getByText(ticketCategoryLabels[TicketCategory.technicalQuestion])
    ).toBeInTheDocument()
    expect(screen.getByText("I forgot my password.")).toBeInTheDocument()

    expect(screen.queryByText("Failed to load ticket")).not.toBeInTheDocument()
  })

  it('shows "Uncategorized" when the ticket has no category', async () => {
    mockGetByUrl({ ticket: { ...ticket, category: null } })

    renderTicketDetail()

    expect(await screen.findByText("Uncategorized")).toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderTicketDetail()

    expect(await screen.findByText("Failed to load ticket")).toBeInTheDocument()
  })

  it("links back to the tickets list", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    renderTicketDetail()

    expect(
      screen.getByRole("link", { name: "← Back to Tickets" })
    ).toHaveAttribute("href", "/tickets")
  })

  it("shows Unassigned when no agent is assigned", async () => {
    mockGetByUrl({ ticket })

    renderTicketDetail()

    await screen.findByText("Can't log in")
    expect(screen.getByRole("combobox", { name: "Assigned to" })).toHaveTextContent(
      "Unassigned"
    )
  })

  it("shows the assigned agent's name", async () => {
    mockGetByUrl({ ticket: { ...ticket, assignedTo: "agent-2" } })

    renderTicketDetail()

    await screen.findByText("Can't log in")
    expect(await screen.findByText("Bob Agent")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Assigned to" })).toHaveTextContent(
      "Bob Agent"
    )
  })

  it("assigns the ticket to the selected agent", async () => {
    mockGetByUrl({ ticket })
    mockPatch.mockResolvedValue({ data: { ...ticket, assignedTo: "agent-1" } })

    renderTicketDetail()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Assigned to" }))
    await userEvent.click(await screen.findByRole("option", { name: "Alice Agent" }))

    expect(mockPatch).toHaveBeenCalledWith("/api/tickets/1", { assignedTo: "agent-1" })
    expect(
      await screen.findByRole("combobox", { name: "Assigned to" })
    ).toHaveTextContent("Alice Agent")
  })

  it("unassigns the ticket when 'Unassigned' is selected", async () => {
    mockGetByUrl({ ticket: { ...ticket, assignedTo: "agent-1" } })
    mockPatch.mockResolvedValue({ data: { ...ticket, assignedTo: null } })

    renderTicketDetail()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Assigned to" }))
    await userEvent.click(await screen.findByRole("option", { name: "Unassigned" }))

    expect(mockPatch).toHaveBeenCalledWith("/api/tickets/1", { assignedTo: null })
  })

  it("updates the ticket status", async () => {
    mockGetByUrl({ ticket })
    mockPatch.mockResolvedValue({ data: { ...ticket, status: TicketStatus.resolved } })

    renderTicketDetail()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }))
    await userEvent.click(
      await screen.findByRole("option", { name: ticketStatusLabels[TicketStatus.resolved] })
    )

    expect(mockPatch).toHaveBeenCalledWith("/api/tickets/1", {
      status: TicketStatus.resolved,
    })
    expect(
      await screen.findByRole("combobox", { name: "Status" })
    ).toHaveTextContent(ticketStatusLabels[TicketStatus.resolved])
  })

  it("updates the ticket category", async () => {
    mockGetByUrl({ ticket })
    mockPatch.mockResolvedValue({ data: { ...ticket, category: TicketCategory.refundRequest } })

    renderTicketDetail()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Category" }))
    await userEvent.click(
      await screen.findByRole("option", {
        name: ticketCategoryLabels[TicketCategory.refundRequest],
      })
    )

    expect(mockPatch).toHaveBeenCalledWith("/api/tickets/1", {
      category: TicketCategory.refundRequest,
    })
  })

  it("clears the category when 'Uncategorized' is selected", async () => {
    mockGetByUrl({ ticket })
    mockPatch.mockResolvedValue({ data: { ...ticket, category: null } })

    renderTicketDetail()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Category" }))
    await userEvent.click(await screen.findByRole("option", { name: "Uncategorized" }))

    expect(mockPatch).toHaveBeenCalledWith("/api/tickets/1", { category: null })
  })

  it("renders the reply thread", async () => {
    mockGetByUrl({ ticket, replies })

    renderTicketDetail()

    expect(
      await screen.findByText("Have you tried resetting your password?")
    ).toBeInTheDocument()
    expect(screen.getByText("Alice Agent")).toBeInTheDocument()
  })

  it("shows an empty state when there are no replies", async () => {
    mockGetByUrl({ ticket, replies: [] })

    renderTicketDetail()

    expect(await screen.findByText("No replies yet.")).toBeInTheDocument()
  })

  it("submits a new reply and appends it to the thread", async () => {
    mockGetByUrl({ ticket, replies: [] })
    mockPost.mockResolvedValue({
      data: {
        id: "reply-2",
        ticketId: "1",
        authorId: "agent-2",
        author: { id: "agent-2", name: "Bob Agent" },
        body: "Thanks for reaching out.",
        createdAt: "2024-01-17T00:00:00.000Z",
      },
    })

    renderTicketDetail()
    await screen.findByText("No replies yet.")

    await userEvent.type(
      screen.getByRole("textbox", { name: "Reply" }),
      "Thanks for reaching out."
    )
    await userEvent.click(screen.getByRole("button", { name: "Send Reply" }))

    expect(mockPost).toHaveBeenCalledWith("/api/tickets/1/replies", {
      body: "Thanks for reaching out.",
    })
    expect(
      await screen.findByText("Thanks for reaching out.")
    ).toBeInTheDocument()
  })

  it("shows a validation error when submitting an empty reply", async () => {
    mockGetByUrl({ ticket, replies: [] })

    renderTicketDetail()
    await screen.findByText("No replies yet.")

    await userEvent.click(screen.getByRole("button", { name: "Send Reply" }))

    expect(await screen.findByText("Reply cannot be empty")).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
