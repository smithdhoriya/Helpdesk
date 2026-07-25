import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { TicketStatus, TicketCategory, ticketStatusLabels } from "@/lib/tickets"
import Tickets from "./Tickets"

function renderTickets() {
  return renderWithQuery(
    <MemoryRouter>
      <Tickets />
    </MemoryRouter>
  )
}

function renderTicketsWithRouting() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/tickets"]}>
      <Routes>
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<div>Ticket Detail Page</div>} />
      </Routes>
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
    expect(firstRow.getByText(ticketStatusLabels[TicketStatus.open])).toBeInTheDocument()
    expect(firstRow.getByText("Technical Question")).toBeInTheDocument()

    const secondRow = within(rows[2])
    expect(secondRow.getByText("Refund please")).toBeInTheDocument()
    expect(secondRow.getByText(ticketStatusLabels[TicketStatus.resolved])).toBeInTheDocument()
    expect(secondRow.getByText("Uncategorized")).toBeInTheDocument()

    expect(screen.queryByText("Failed to load tickets")).not.toBeInTheDocument()
  })

  it("navigates to the ticket detail page when a row is clicked", async () => {
    mockGet.mockResolvedValue({ data: tickets })

    renderTicketsWithRouting()

    const row = (await screen.findByText("Can't log in")).closest("tr")!
    await userEvent.click(row)

    expect(await screen.findByText("Ticket Detail Page")).toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderTickets()

    expect(await screen.findByText("Failed to load tickets")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("sorts by createdAt descending by default", async () => {
    mockGet.mockResolvedValue({ data: tickets })

    renderTickets()

    await screen.findByText("Can't log in")

    expect(mockGet).toHaveBeenCalledWith("/api/tickets", {
      params: { sortBy: "createdAt", sortOrder: "desc" },
    })
    expect(screen.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
      "aria-sort",
      "descending"
    )
  })

  it("requests ascending order the first time an unsorted column header is clicked", async () => {
    mockGet.mockResolvedValue({ data: tickets })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("button", { name: "Subject" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "asc" },
      })
    })
    expect(screen.getByRole("columnheader", { name: "Subject" })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )
    // switching the active column resets the previously active one
    expect(screen.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
      "aria-sort",
      "none"
    )
  })

  it("toggles asc -> desc -> cleared (back to default) across three clicks", async () => {
    mockGet.mockResolvedValue({ data: tickets })

    renderTickets()
    await screen.findByText("Can't log in")

    const subjectHeader = screen.getByRole("button", { name: "Subject" })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "asc" },
      })
    })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "desc" },
      })
    })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc" },
      })
    })
    expect(screen.getByRole("columnheader", { name: "Subject" })).toHaveAttribute(
      "aria-sort",
      "none"
    )
  })

  it("re-renders rows in the order the server returns after a header is clicked", async () => {
    // Realistic default order (createdAt desc, newest first): "Refund please" (March)
    // before "Can't log in" (January) — deliberately the reverse of subject-ascending
    // order below, so this test actually proves a re-render reordered the rows rather
    // than coincidentally rendering the same order both times.
    const defaultOrderTickets = [tickets[1], tickets[0]]
    const subjectAscTickets = [...tickets].sort((a, b) =>
      a.subject.localeCompare(b.subject)
    )

    mockGet.mockImplementation((_url, config) => {
      const params = (config as { params: { sortBy: string } }).params
      const data = params.sortBy === "subject" ? subjectAscTickets : defaultOrderTickets
      return Promise.resolve({ data })
    })

    renderTickets()
    await screen.findByText("Refund please")

    let rows = screen.getAllByRole("row")
    expect(within(rows[1]).getByText("Refund please")).toBeInTheDocument()
    expect(within(rows[2]).getByText("Can't log in")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Subject" }))

    await waitFor(() => {
      const updatedRows = screen.getAllByRole("row")
      expect(within(updatedRows[1]).getByText("Can't log in")).toBeInTheDocument()
      expect(within(updatedRows[2]).getByText("Refund please")).toBeInTheDocument()
    })

    rows = screen.getAllByRole("row")
    expect(rows).toHaveLength(3)
  })
})
