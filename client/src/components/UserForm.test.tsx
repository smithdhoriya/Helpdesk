import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import UserForm from "./UserForm"

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}))

const mockPost = vi.mocked(api.post)

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace")
  await user.type(screen.getByLabelText("Email"), "ada@example.com")
  await user.type(screen.getByLabelText("Password"), "password123")
}

describe("UserForm", () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it("renders the Name, Email, and Password fields", () => {
    renderWithQuery(<UserForm onSuccess={vi.fn()} />)

    expect(screen.getByLabelText("Name")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Create User" })
    ).toBeInTheDocument()
  })

  it("blocks submission and shows errors for invalid input", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithQuery(<UserForm onSuccess={onSuccess} />)

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
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("submits with the right payload and calls onSuccess on valid input", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockPost.mockResolvedValue({
      data: {
        id: "3",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "agent",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    })

    renderWithQuery(<UserForm onSuccess={onSuccess} />)

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create User" }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/users", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "password123",
      })
    })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it("disables the submit button and shows a loading label while submitting", async () => {
    const user = userEvent.setup()
    let resolvePost!: (value: unknown) => void
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }) as never
    )

    renderWithQuery(<UserForm onSuccess={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create User" }))

    const submitButton = await screen.findByRole("button", {
      name: "Creating...",
    })
    expect(submitButton).toBeDisabled()

    resolvePost({
      data: {
        id: "3",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "agent",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create User" })
      ).not.toBeDisabled()
    })
  })

  it("shows a server error inline without calling onSuccess on failure", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "A user with this email already exists" } },
    })

    renderWithQuery(<UserForm onSuccess={onSuccess} />)

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(
      await screen.findByText("A user with this email already exists")
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("shows a generic error inline when the failure has no server message", async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValue(new Error("network error"))

    renderWithQuery(<UserForm onSuccess={vi.fn()} />)

    await fillValidForm(user)
    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(await screen.findByText("Failed to create user")).toBeInTheDocument()
  })
})
