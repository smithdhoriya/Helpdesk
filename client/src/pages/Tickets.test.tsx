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
    resolvedByAi: false,
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
    resolvedByAi: false,
    assignedTo: null,
    createdAt: "2024-03-02T00:00:00.000Z",
    updatedAt: "2024-03-02T00:00:00.000Z",
  },
]

function makePage(
  pageTickets: typeof tickets,
  overrides: { total?: number; page?: number; pageSize?: number } = {}
) {
  return {
    tickets: pageTickets,
    total: overrides.total ?? pageTickets.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
  }
}

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
    mockGet.mockResolvedValue({ data: makePage(tickets) })

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
    mockGet.mockResolvedValue({ data: makePage(tickets) })

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
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()

    await screen.findByText("Can't log in")

    expect(mockGet).toHaveBeenCalledWith("/api/tickets", {
      params: { sortBy: "createdAt", sortOrder: "desc", page: 1 },
    })
    expect(screen.getByRole("columnheader", { name: "Created" })).toHaveAttribute(
      "aria-sort",
      "descending"
    )
  })

  it("requests ascending order the first time an unsorted column header is clicked", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("button", { name: "Subject" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "asc", page: 1 },
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
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    const subjectHeader = screen.getByRole("button", { name: "Subject" })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "asc", page: 1 },
      })
    })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "desc", page: 1 },
      })
    })

    await userEvent.click(subjectHeader)
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", page: 1 },
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
      return Promise.resolve({ data: makePage(data) })
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

  it("requests a status filter when a status is selected", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by status" }))
    await userEvent.click(await screen.findByRole("option", { name: "Resolved" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", status: "resolved", page: 1 },
      })
    })
  })

  it("requests a category filter, including the uncategorized option", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by category" }))
    await userEvent.click(await screen.findByRole("option", { name: "Uncategorized" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", category: "uncategorized", page: 1 },
      })
    })
  })

  it("clears a filter by re-selecting the 'all' option", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by status" }))
    await userEvent.click(await screen.findByRole("option", { name: "Resolved" }))
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", status: "resolved", page: 1 },
      })
    })

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by status" }))
    await userEvent.click(await screen.findByRole("option", { name: "All statuses" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", page: 1 },
      })
    })
  })

  it("debounces search input and requests a search filter", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.type(screen.getByLabelText("Search tickets"), "refund")

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", search: "refund", page: 1 },
      })
    })
  })

  it("shows the pagination summary and disables Previous on the first page", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets, { total: 45, page: 1, pageSize: 20 }) })

    renderTickets()
    await screen.findByText("Can't log in")

    expect(screen.getByText("Showing 1-20 of 45")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled()
  })

  it("disables Next on the last page", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets, { total: 45, page: 3, pageSize: 20 }) })

    renderTickets()
    await screen.findByText("Can't log in")

    expect(screen.getByText("Showing 41-45 of 45")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled()
  })

  it("requests the next page when Next is clicked, and resets to page 1 on a new sort", async () => {
    mockGet.mockResolvedValue({ data: makePage(tickets, { total: 45, page: 1, pageSize: 20 }) })

    renderTickets()
    await screen.findByText("Can't log in")

    await userEvent.click(screen.getByRole("button", { name: /next/i }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "createdAt", sortOrder: "desc", page: 2 },
      })
    })

    await userEvent.click(screen.getByRole("button", { name: "Subject" }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith("/api/tickets", {
        params: { sortBy: "subject", sortOrder: "asc", page: 1 },
      })
    })
  })
})
