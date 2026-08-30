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
  bodyHtml: null,
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

function getPolish() {
  return screen.getByRole("button", { name: "Polish" })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Both actions go through `api.post`, so route by URL: the polish endpoint gets
 * `polished`, the create endpoint gets the created reply.
 */
function mockPolishEndpoint(polished: string) {
  mockPost.mockImplementation(((url: string) =>
    url.endsWith("/polish")
      ? Promise.resolve({ data: { body: polished } })
      : Promise.resolve({ data: createdReply })) as never)
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

  it("disables Send when the reply is empty instead of showing a validation error", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    // Empty on first render: Send is disabled and no error is shown.
    expect(getSubmit()).toBeDisabled()

    await user.click(getSubmit())

    expect(screen.queryByText("Reply cannot be empty")).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("keeps Send disabled for a whitespace-only reply", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "     ")

    expect(getSubmit()).toBeDisabled()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("enables Send once the reply has content", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    expect(getSubmit()).toBeDisabled()

    await user.type(getTextarea(), "Thanks for reaching out.")

    expect(getSubmit()).toBeEnabled()
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

describe("ReplyForm — Polish", () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it("renders the Polish button before Send Reply", () => {
    renderWithQuery(<ReplyForm ticket={ticket} />)

    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["Polish", "Send Reply"])
  })

  it("sends the current draft to the polish endpoint", async () => {
    const user = userEvent.setup()
    mockPolishEndpoint("Polished version.")

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "cant reset you're password")
    await user.click(getPolish())

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/api/tickets/ticket-1/replies/polish",
        { body: "cant reset you're password" }
      )
    })
  })

  it("replaces the draft with the polished text", async () => {
    const user = userEvent.setup()
    mockPolishEndpoint("You can't reset your password yet.")

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "cant reset you're password")
    await user.click(getPolish())

    await waitFor(() =>
      expect(getTextarea()).toHaveValue("You can't reset your password yet.")
    )
  })

  it("does not send the reply when polishing", async () => {
    const user = userEvent.setup()
    mockPolishEndpoint("Polished version.")

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "draft text")
    await user.click(getPolish())

    await waitFor(() => expect(getTextarea()).toHaveValue("Polished version."))
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).not.toHaveBeenCalledWith(
      "/api/tickets/ticket-1/replies",
      expect.anything()
    )
  })

  it("shows a pending label and blocks both actions while polishing", async () => {
    const user = userEvent.setup()
    const pending = deferred<{ data: { body: string } }>()
    mockPost.mockReturnValue(pending.promise as never)

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "draft text")
    await user.click(getPolish())

    expect(await screen.findByRole("button", { name: "Polishing..." }))
      .toBeDisabled()
    expect(getSubmit()).toBeDisabled()

    pending.resolve({ data: { body: "Polished version." } })
    await waitFor(() => expect(getPolish()).toBeEnabled())
  })

  it("disables Polish when the draft is empty instead of showing a validation error", async () => {
    const user = userEvent.setup()

    renderWithQuery(<ReplyForm ticket={ticket} />)

    expect(getPolish()).toBeDisabled()

    await user.click(getPolish())

    expect(screen.queryByText("Reply cannot be empty")).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("keeps the draft and shows the server error when polishing fails", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          error: "Reply polishing is unavailable (cannot reach the local AI service)",
        },
      },
    })

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "draft text")
    await user.click(getPolish())

    expect(
      await screen.findByText(
        "Reply polishing is unavailable (cannot reach the local AI service)"
      )
    ).toBeInTheDocument()
    expect(getTextarea()).toHaveValue("draft text")
  })

  it("shows a generic error when the failure has no server message", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue(new Error("network error"))

    renderWithQuery(<ReplyForm ticket={ticket} />)

    await user.type(getTextarea(), "draft text")
    await user.click(getPolish())

    expect(await screen.findByText("Failed to polish reply")).toBeInTheDocument()
  })
})
