import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { api } from "@/lib/api"
import { renderWithQuery } from "@/test/render"
import { UserRole } from "@/lib/users"
import DeleteUserDialog from "./DeleteUserDialog"

vi.mock("@/lib/api", () => ({
  api: { delete: vi.fn() },
}))

const mockDelete = vi.mocked(api.delete)

const user = {
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: UserRole.agent,
  createdAt: "2024-01-01T00:00:00.000Z",
}

describe("DeleteUserDialog", () => {
  beforeEach(() => {
    mockDelete.mockReset()
  })

  it("does not render the dialog when there is no target user", () => {
    renderWithQuery(<DeleteUserDialog user={null} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows the dialog with the user's name in the confirmation message", () => {
    renderWithQuery(<DeleteUserDialog user={user} onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(
      screen.getByText("Delete Ada Lovelace? This can't be undone.")
    ).toBeInTheDocument()
  })

  it("closes without calling the API when Cancel is clicked", async () => {
    const userEventInstance = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithQuery(<DeleteUserDialog user={user} onOpenChange={onOpenChange} />)

    await userEventInstance.click(screen.getByRole("button", { name: "Cancel" }))

    expect(mockDelete).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })

  it("calls the delete API and closes the dialog on confirm", async () => {
    const userEventInstance = userEvent.setup()
    const onOpenChange = vi.fn()
    mockDelete.mockResolvedValue({})

    renderWithQuery(<DeleteUserDialog user={user} onOpenChange={onOpenChange} />)

    await userEventInstance.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/api/users/1")
    })

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("shows an inline error and keeps the dialog open when the delete fails", async () => {
    const userEventInstance = userEvent.setup()
    const onOpenChange = vi.fn()
    mockDelete.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: "Admin users cannot be deleted" } },
    })

    renderWithQuery(<DeleteUserDialog user={user} onOpenChange={onOpenChange} />)

    await userEventInstance.click(screen.getByRole("button", { name: "Delete" }))

    expect(
      await screen.findByText("Admin users cannot be deleted")
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
