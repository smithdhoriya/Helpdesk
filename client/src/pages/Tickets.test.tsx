import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { TicketStatus, TicketCategory } from "@/lib/tickets"
import Tickets from "./Tickets"

function renderTickets() {
  return renderWithQuery(
    <MemoryRouter>
      <Tickets />
    </MemoryRouter>
  )
}

vi.mock("@/lib/api", () => ({
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

const tickets = [
  {
    id: "1",
    subject: "Can't log in",
    body: "I forgot my password.",
    senderEmail: "customer@example.com",
    status: TicketStatus.open,
    category: TicketCategory.technicalQuestion,
    assignedTo: null,
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "2",
    subject: "Refund please",
    body: "I want a refund.",
    senderEmail: "buyer@example.com",
    status: TicketStatus.resolved,
    category: null,
    assignedTo: null,
    createdAt: "2024-03-02T00:00:00.000Z",
    updatedAt: "2024-03-02T00:00:00.000Z",
  },
]

describe("Tickets page", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it("shows skeleton rows while the request is pending", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    const { container } = renderTickets()

    expect(screen.getByText("Tickets")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Subject" })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(25)
  })

  it("renders the ticket list once the request resolves", async () => {
    mockGet.mockResolvedValue({ data: tickets })

    renderTickets()

    expect(await screen.findByText("Can't log in")).toBeInTheDocument()

    const rows = screen.getAllByRole("row")
    // 1 header row + 2 ticket rows
    expect(rows).toHaveLength(3)

    const firstRow = within(rows[1])
    expect(firstRow.getByText("customer@example.com")).toBeInTheDocument()
    expect(firstRow.getByText(TicketStatus.open)).toBeInTheDocument()
    expect(firstRow.getByText("Technical Question")).toBeInTheDocument()

    const secondRow = within(rows[2])
    expect(secondRow.getByText("Refund please")).toBeInTheDocument()
    expect(secondRow.getByText(TicketStatus.resolved)).toBeInTheDocument()
    expect(secondRow.getByText("Uncategorized")).toBeInTheDocument()

    expect(screen.queryByText("Failed to load tickets")).not.toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderTickets()

    expect(await screen.findByText("Failed to load tickets")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
