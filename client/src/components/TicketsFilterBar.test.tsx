import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { type TicketsFilters } from "@/lib/tickets"
import TicketsFilterBar from "./TicketsFilterBar"

function renderFilterBar(filters: TicketsFilters = {}) {
  const onResolvedByAiChange = vi.fn()
  render(
    <TicketsFilterBar
      filters={filters}
      searchInput=""
      onSearchInputChange={vi.fn()}
      onStatusChange={vi.fn()}
      onCategoryChange={vi.fn()}
      onResolvedByAiChange={onResolvedByAiChange}
    />
  )
  return { onResolvedByAiChange }
}

function getShowAiResolved() {
  return screen.getByRole("checkbox", { name: "Show AI-resolved" })
}

describe("TicketsFilterBar — Show AI-resolved", () => {
  it("is unchecked by default", () => {
    renderFilterBar()

    expect(getShowAiResolved()).not.toBeChecked()
  })

  it("reflects the resolvedByAi filter when it is set", () => {
    renderFilterBar({ resolvedByAi: true })

    expect(getShowAiResolved()).toBeChecked()
  })

  it("notifies when toggled on", async () => {
    const { onResolvedByAiChange } = renderFilterBar()

    await userEvent.click(getShowAiResolved())

    expect(onResolvedByAiChange).toHaveBeenCalledWith(true)
  })

  it("notifies when toggled off", async () => {
    const { onResolvedByAiChange } = renderFilterBar({ resolvedByAi: true })

    await userEvent.click(getShowAiResolved())

    expect(onResolvedByAiChange).toHaveBeenCalledWith(false)
  })
})
