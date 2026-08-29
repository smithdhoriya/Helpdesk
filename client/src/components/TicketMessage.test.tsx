import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { TicketCategory, TicketStatus, type Ticket } from "@/lib/tickets"
import TicketMessage from "./TicketMessage"

const ticket: Ticket = {
  id: "1",
  subject: "Can't log in",
  body: "Plain text fallback.",
  bodyHtml: null,
  senderEmail: "customer@example.com",
  status: TicketStatus.open,
  category: TicketCategory.technicalQuestion,
  assignedTo: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z",
}

function renderMessage(overrides: Partial<Ticket> = {}) {
  return render(<TicketMessage ticket={{ ...ticket, ...overrides }} />)
}

/**
 * Reads the global that the payloads below try to set. It staying `undefined`
 * means the injected script never ran.
 */
function xssProbe() {
  return (window as unknown as Record<string, unknown>).__xss
}

describe("TicketMessage", () => {
  it("renders the subject and sender", () => {
    renderMessage()

    expect(screen.getByText("Can't log in")).toBeInTheDocument()
    expect(screen.getByText("From customer@example.com")).toBeInTheDocument()
  })

  it("renders the plain-text body when there is no HTML part", () => {
    renderMessage()

    expect(screen.getByText("Plain text fallback.")).toBeInTheDocument()
    expect(screen.queryByTestId("ticket-body-html")).not.toBeInTheDocument()
  })

  it("renders the HTML part instead of the plain-text body when present", () => {
    renderMessage({ bodyHtml: "<p>HTML <strong>version</strong>.</p>" })

    const html = screen.getByTestId("ticket-body-html")
    expect(html.querySelector("strong")?.textContent).toBe("version")
    expect(screen.queryByText("Plain text fallback.")).not.toBeInTheDocument()
  })
})

describe("TicketMessage — XSS protection", () => {
  it("does not render a script element from the HTML part", () => {
    renderMessage({
      bodyHtml: "<p>Hello</p><script>window.__xss = true</script>",
    })

    expect(screen.getByTestId("ticket-body-html").textContent).toBe("Hello")
    expect(document.querySelector("script")).toBeNull()
    expect(xssProbe()).toBeUndefined()
  })

  it("strips inline event handlers from the rendered HTML", () => {
    renderMessage({
      bodyHtml: '<img src="x" onerror="window.__xss = true"><p>Body</p>',
    })

    const img = screen.getByTestId("ticket-body-html").querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.hasAttribute("onerror")).toBe(false)
    expect(xssProbe()).toBeUndefined()
  })

  it("strips javascript: hrefs from rendered links", () => {
    renderMessage({ bodyHtml: '<a href="javascript:alert(1)">Click me</a>' })

    const link = screen.getByTestId("ticket-body-html").querySelector("a")
    expect(link?.textContent).toBe("Click me")
    expect(link?.hasAttribute("href")).toBe(false)
  })

  it("does not render an iframe from the HTML part", () => {
    renderMessage({
      bodyHtml: '<p>Hi</p><iframe src="https://evil.example"></iframe>',
    })

    expect(
      screen.getByTestId("ticket-body-html").querySelector("iframe")
    ).toBeNull()
  })

  it("falls back to the plain-text body when the HTML part is entirely unsafe", () => {
    renderMessage({ bodyHtml: "<script>window.__xss = true</script>" })

    expect(screen.getByText("Plain text fallback.")).toBeInTheDocument()
    expect(screen.queryByTestId("ticket-body-html")).not.toBeInTheDocument()
  })
})
