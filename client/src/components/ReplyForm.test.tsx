import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { TicketStatus, TicketCategory, type Ticket } from "@/lib/tickets"
import ReplyForm from "./ReplyForm"

// Keep the real `getApiErrorMessage` (a pure helper over axios) and stub only
// the network client. `createReply` from `@/lib/tickets` stays real and calls
// this mocked `api.post`, so we exercise the component's actual request path.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { post: vi.fn() },
}))

const mockPost = vi.mocked(api.post)

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

const createdReply = {
  id: "reply-1",
  ticketId: "ticket-1",
  authorId: "agent-1",
  author: { id: "agent-1", name: "Alice Agent" },
  body: "Thanks for reaching out.",
  createdAt: "2024-01-16T00:00:00.000Z",
}

function getTextarea() {
  return screen.getByRole("textbox", { name: "Reply" })
}

function getSubmit() {
  return screen.getByRole("button", { name: "Send Reply" })
}

describe("ReplyForm", () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it("renders the reply textarea and submit button", () => {
    renderWithQuery(<ReplyForm ticket={ticket} />)

    expect(getTextarea()).toBeInTheDocument()
    expect(getSubmit()).toBeInTheDocument()
  })

  it("submits the reply to the ticket's replies endpoint", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ data: createdReply })

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "Thanks for reaching out.")
    await user.click(getSubmit())

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/tickets/ticket-1/replies", {
        body: "Thanks for reaching out.",
      })
    })
  })

  it("clears the textarea after a successful submit", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ data: createdReply })

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "Thanks for reaching out.")
    await user.click(getSubmit())

    await waitFor(() => expect(getTextarea()).toHaveValue(""))
  })

  it("trims surrounding whitespace before sending", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ data: createdReply })

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "   Hello there   ")
    await user.click(getSubmit())

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/tickets/ticket-1/replies", {
        body: "Hello there",
      })
    })
  })

  it("shows a validation error and does not submit when the reply is empty", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.click(getSubmit())

    expect(await screen.findByText("Reply cannot be empty")).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("rejects a whitespace-only reply", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "     ")
    await user.click(getSubmit())

    expect(await screen.findByText("Reply cannot be empty")).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("shows the server's error message when the request fails", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "Ticket not found" } },
    })

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "Thanks for reaching out.")
    await user.click(getSubmit())

    expect(await screen.findByText("Ticket not found")).toBeInTheDocument()
    // The failed reply text stays in the textarea so it isn't lost.
    expect(getTextarea()).toHaveValue("Thanks for reaching out.")
  })

  it("shows a generic error when the failure has no server message", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue(new Error("network error"))

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "Thanks for reaching out.")
    await user.click(getSubmit())

    expect(await screen.findByText("Failed to send reply")).toBeInTheDocument()
  })
})
