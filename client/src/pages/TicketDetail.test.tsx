import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
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

describe("TicketDetail page", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it("shows skeleton placeholders while the request is pending", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    const { container } = renderTicketDetail()

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
  })

  it("renders the ticket once the request resolves", async () => {
    mockGet.mockResolvedValue({ data: ticket })

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
    mockGet.mockResolvedValue({ data: { ...ticket, category: null } })

    renderTicketDetail()

    expect(await screen.findByText("Uncategorized")).toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderTicketDetail()

    expect(await screen.findByText("Failed to load ticket")).toBeInTheDocument()
  })
})
