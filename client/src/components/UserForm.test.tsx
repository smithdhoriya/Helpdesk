import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import UserForm from "./UserForm"

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn(), patch: vi.fn() },
}))

const mockPost = vi.mocked(api.post)
const mockPatch = vi.mocked(api.patch)

const existingUser = {
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "agent" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace")
  await user.type(screen.getByLabelText("Email"), "ada@example.com")
  await user.type(screen.getByLabelText("Password"), "password123")
}

describe("UserForm", () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPatch.mockReset()
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

describe("UserForm editing an existing user", () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPatch.mockReset()
  })

  it("renders pre-filled with the user's data and a Save Changes button", () => {
    renderWithQuery(<UserForm user={existingUser} onSuccess={vi.fn()} />)

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace")
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com")
    expect(screen.getByLabelText("Password")).toHaveValue("")
    expect(
      screen.getByText("Leave blank to keep the current password.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeInTheDocument()
  })

  it("submits an update without a password when the field is left blank", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockPatch.mockResolvedValue({ data: { ...existingUser, name: "Ada K. Lovelace" } })

    renderWithQuery(<UserForm user={existingUser} onSuccess={onSuccess} />)

    const nameInput = screen.getByLabelText("Name")
    await user.clear(nameInput)
    await user.type(nameInput, "Ada K. Lovelace")
    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/api/users/1", {
        name: "Ada K. Lovelace",
        email: "ada@example.com",
        password: "",
      })
    })
    expect(mockPost).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it("submits an update with a new password when one is provided", async () => {
    const user = userEvent.setup()
    mockPatch.mockResolvedValue({ data: existingUser })

    renderWithQuery(<UserForm user={existingUser} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Password"), "newpassword123")
    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/api/users/1", {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "newpassword123",
      })
    })
  })

  it("blocks submission and shows an error for a too-short password", async () => {
    const user = userEvent.setup()
    renderWithQuery(<UserForm user={existingUser} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Password"), "short")
    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    expect(
      await screen.findByText("Password must be at least 8 characters")
    ).toBeInTheDocument()
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it("shows a server error inline without calling onSuccess on failure", async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    mockPatch.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "A user with this email already exists" } },
    })

    renderWithQuery(<UserForm user={existingUser} onSuccess={onSuccess} />)

    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    expect(
      await screen.findByText("A user with this email already exists")
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
