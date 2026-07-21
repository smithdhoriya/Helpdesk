import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import Users from "./Users"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}))

const mockGet = vi.mocked(api.get)

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
    role: "admin" as const,
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Grace Hopper",
    email: "grace@example.com",
    role: "agent" as const,
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
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(20)
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
    expect(adaRow.getByText("admin")).toBeInTheDocument()
    expect(
      adaRow.getByText(new Date(users[0].createdAt).toLocaleDateString())
    ).toBeInTheDocument()

    const graceRow = within(rows[2])
    expect(graceRow.getByText("Grace Hopper")).toBeInTheDocument()
    expect(graceRow.getByText("agent")).toBeInTheDocument()

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

describe("Create User dialog", () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: users })
  })

  it("shows the dialog when the Create User button is clicked", async () => {
    const user = userEvent.setup()
    renderWithQuery(<Users />)

    await user.click(screen.getByRole("button", { name: "Create User" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
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
})
