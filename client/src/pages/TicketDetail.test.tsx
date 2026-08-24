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

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}))

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

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

// Both the ticket and the agents list are fetched via the same mocked `api.get`,
// so responses are routed by URL to keep each test's intent readable.
function mockGetByUrl({ ticket, agents: agentsData = agents }: { ticket: unknown; agents?: unknown }) {
  mockGet.mockImplementation((url: unknown) => {
    if (url === "/api/tickets/agents") {
      return Promise.resolve({ data: agentsData })
    }
    return Promise.resolve({ data: ticket })
  })
}

describe("TicketDetail page", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPatch.mockReset()
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
})
