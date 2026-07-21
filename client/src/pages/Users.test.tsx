import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { UserRole } from "@/lib/users"
import Users from "./Users"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)
const mockDelete = vi.mocked(api.delete)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const users = [
  {
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: UserRole.admin,
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Grace Hopper",
    email: "grace@example.com",
    role: UserRole.agent,
    createdAt: "2024-03-02T00:00:00.000Z",
  },
]

describe("Users page", () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it("shows skeleton rows while the request is pending", () => {
    mockGet.mockReturnValue(deferred().promise as never)

    const { container } = renderWithQuery(<Users />)

    expect(screen.getByText("Users")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(25)
  })

  it("renders the user list once the request resolves", async () => {
    mockGet.mockResolvedValue({ data: users })

    renderWithQuery(<Users />)

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()

    const rows = screen.getAllByRole("row")
    // 1 header row + 2 user rows
    expect(rows).toHaveLength(3)

    const adaRow = within(rows[1])
    expect(adaRow.getByText("ada@example.com")).toBeInTheDocument()
    expect(adaRow.getByText(UserRole.admin)).toBeInTheDocument()
    expect(
      adaRow.getByText(new Date(users[0].createdAt).toLocaleDateString())
    ).toBeInTheDocument()

    const graceRow = within(rows[2])
    expect(graceRow.getByText("Grace Hopper")).toBeInTheDocument()
    expect(graceRow.getByText(UserRole.agent)).toBeInTheDocument()

    expect(
      screen.queryByText("Failed to load users")
    ).not.toBeInTheDocument()
  })

  it("shows an error message when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("network error"))

    renderWithQuery(<Users />)

    expect(await screen.findByText("Failed to load users")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})

describe("User dialog", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: users })
    mockPatch.mockReset()
  })

  it("shows the dialog when the Create User button is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Create User" })).toBeInTheDocument()
  })

  it("hides the dialog when clicking outside of it", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await user.click(screen.getByRole("button", { name: "Create User" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    await user.click(overlay as Element)

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("hides the dialog when the Escape key is pressed", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await user.click(screen.getByRole("button", { name: "Create User" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("opens pre-filled when a row's edit button is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Edit User" })).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace")
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com")
  })

  it("saves an edit, closes the dialog, and calls the API with the right payload", async () => {
    const user = userEvent.setup()
    mockPatch.mockResolvedValue({ data: { ...users[0], name: "Ada K. Lovelace" } })

    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }))

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

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("only ever renders a single dialog instance, reused for create and edit", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")

    await user.click(screen.getByRole("button", { name: "Create User" }))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Edit Ada Lovelace" }))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Edit User" })).toBeInTheDocument()
  })
})

describe("Delete User dialog", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: users })
    mockDelete.mockReset()
  })

  it("disables the delete button for an admin row", async () => {
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")

    expect(screen.getByRole("button", { name: "Delete Ada Lovelace" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Delete Grace Hopper" })
    ).not.toBeDisabled()
  })

  it("opens a confirmation dialog when a row's delete button is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Delete Grace Hopper" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(
      screen.getByText("Delete Grace Hopper? This can't be undone.")
    ).toBeInTheDocument()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("leaves the user in the table when Cancel is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Delete Grace Hopper" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
  })

  it("removes the user from the table after confirming deletion", async () => {
    const user = userEvent.setup()
    mockGet
      .mockResolvedValueOnce({ data: users })
      .mockResolvedValueOnce({ data: [users[0]] })
    mockDelete.mockResolvedValue({})
    renderWithQuery(<Users />)

    await screen.findByText("Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Delete Grace Hopper" }))
    await user.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/api/users/2")
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument()
    })
  })
})
