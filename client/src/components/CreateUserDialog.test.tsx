import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import CreateUserDialog from "./CreateUserDialog"

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}))

const mockPost = vi.mocked(api.post)

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Create User" }))
}

describe("CreateUserDialog", () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it("opens the dialog when the trigger button is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<CreateUserDialog />)

    await openDialog(user)

    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("blocks submission and shows errors for invalid input", async () => {
    const user = userEvent.setup()
    renderWithQuery(<CreateUserDialog />)

    await openDialog(user)
    await user.type(screen.getByLabelText("Name"), "Al")
    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.type(screen.getByLabelText("Password"), "short")
    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(
      await screen.findByText("Name must be at least 3 characters")
    ).toBeInTheDocument()
    expect(screen.getByText("Invalid email")).toBeInTheDocument()
    expect(
      screen.getByText("Password must be at least 8 characters")
    ).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it("submits, closes the dialog, and calls the API with the right payload on valid input", async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({
      data: {
        id: "3",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "agent",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    })

    renderWithQuery(<CreateUserDialog />)

    await openDialog(user)
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace")
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.click(screen.getByRole("button", { name: "Create User" }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/users", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "password123",
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("shows a server error inline without closing the dialog on failure", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "A user with this email already exists" } },
    })

    renderWithQuery(<CreateUserDialog />)

    await openDialog(user)
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace")
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(
      await screen.findByText("A user with this email already exists")
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })
})
