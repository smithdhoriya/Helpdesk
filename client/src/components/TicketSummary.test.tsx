import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { TicketStatus, TicketCategory, type Ticket } from "@/lib/tickets"
import TicketSummary from "./TicketSummary"

// Keep the real `getApiErrorMessage` and `summarizeTicket` (which calls this
// mocked `api.post`) so the component exercises its actual request path.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { post: vi.fn() },
}))

const mockPost = vi.mocked(api.post)

const ticket: Ticket = {
  id: "ticket-1",
  subject: "Can't log in",
  body: "I forgot my password.",
  bodyHtml: null,
  senderEmail: "customer@example.com",
  status: TicketStatus.open,
  category: TicketCategory.technicalQuestion,
  resolvedByAi: false,
  assignedTo: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
}

function getSummarize() {
  return screen.getByRole("button", { name: "Summarize" })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("TicketSummary", () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it("renders the Summarize button", () => {
    renderWithQuery(<TicketSummary ticket={ticket} />)

    expect(getSummarize()).toBeInTheDocument()
  })

  it("posts to the ticket's summarize endpoint on click", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ data: { summary: "Customer can't log in." } })

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/tickets/ticket-1/summarize")
    })
  })

  it("shows the generated summary", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({
      data: { summary: "Customer can't log in; agent suggested a reset." },
    })

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())

    expect(
      await screen.findByText("Customer can't log in; agent suggested a reset.")
    ).toBeInTheDocument()
  })

  it("shows a pending label and disables the button while summarizing", async () => {
    const user = userEvent.setup()
    const pending = deferred<{ data: { summary: string } }>()
    mockPost.mockReturnValue(pending.promise as never)

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())

    expect(await screen.findByRole("button", { name: "Summarizing..." })).toBeDisabled()

    pending.resolve({ data: { summary: "Done." } })
    await waitFor(() => expect(getSummarize()).toBeEnabled())
  })

  it("regenerates the summary on each click", async () => {
    const user = userEvent.setup()
    mockPost
      .mockResolvedValueOnce({ data: { summary: "First summary." } })
      .mockResolvedValueOnce({ data: { summary: "Second summary." } })

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())
    expect(await screen.findByText("First summary.")).toBeInTheDocument()

    await user.click(getSummarize())
    expect(await screen.findByText("Second summary.")).toBeInTheDocument()

    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it("shows the server's error message when the request fails", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          error: "Ticket summarization is unavailable (cannot reach the local AI service)",
        },
      },
    })

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())

    expect(
      await screen.findByText(
        "Ticket summarization is unavailable (cannot reach the local AI service)"
      )
    ).toBeInTheDocument()
  })

  it("shows a generic error when the failure has no server message", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue(new Error("network error"))

    renderWithQuery(<TicketSummary ticket={ticket} />)

    await user.click(getSummarize())

    expect(await screen.findByText("Failed to summarize ticket")).toBeInTheDocument()
  })
})
