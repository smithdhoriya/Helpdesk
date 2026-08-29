import { describe, expect, it } from "vitest"

import { sanitizeTicketHtml } from "./sanitize-html"

/**
 * Parses sanitized output so tests can assert on the resulting DOM (no script
 * nodes, no event-handler attributes) rather than only on substrings.
 */
function parse(html: string) {
  const container = document.createElement("div")
  container.innerHTML = html
  return container
}

function attributeNames(html: string): string[] {
  const names: string[] = []
  for (const el of parse(html).querySelectorAll("*")) {
    names.push(...Array.from(el.attributes, (attr) => attr.name))
  }
  return names
}

describe("sanitizeTicketHtml — XSS vectors", () => {
  it("removes script elements and their contents", () => {
    const clean = sanitizeTicketHtml(
      "<p>Hello</p><script>alert('xss')</script>"
    )

    expect(parse(clean).querySelector("script")).toBeNull()
    expect(clean).not.toContain("alert")
    expect(clean).toContain("Hello")
  })

  it("strips inline event handlers but keeps the element", () => {
    const clean = sanitizeTicketHtml('<img src="x" onerror="alert(1)">')

    const img = parse(clean).querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.hasAttribute("onerror")).toBe(false)
    expect(clean).not.toContain("alert")
  })

  it("strips event handlers from container elements while keeping their text", () => {
    const clean = sanitizeTicketHtml('<div onclick="alert(1)">Click me</div>')

    expect(attributeNames(clean)).not.toContain("onclick")
    expect(parse(clean).textContent).toBe("Click me")
  })

  it("removes javascript: URLs from links but keeps the link text", () => {
    const clean = sanitizeTicketHtml(
      '<a href="javascript:alert(1)">Click me</a>'
    )

    expect(parse(clean).querySelector("a")?.hasAttribute("href")).toBe(false)
    expect(clean).not.toContain("javascript:")
    expect(parse(clean).textContent).toBe("Click me")
  })

  it("removes iframes, objects, embeds, and forms", () => {
    const clean = sanitizeTicketHtml(
      '<iframe src="https://evil.example"></iframe>' +
        '<object data="evil.swf"></object>' +
        '<embed src="evil.swf">' +
        '<form action="https://evil.example"><input name="password"></form>'
    )

    const dom = parse(clean)
    expect(dom.querySelector("iframe")).toBeNull()
    expect(dom.querySelector("object")).toBeNull()
    expect(dom.querySelector("embed")).toBeNull()
    expect(dom.querySelector("form")).toBeNull()
    expect(dom.querySelector("input")).toBeNull()
  })

  it("removes svg payloads", () => {
    const clean = sanitizeTicketHtml('<svg onload="alert(1)"><circle /></svg>')

    expect(parse(clean).querySelector("svg")).toBeNull()
    expect(clean).not.toContain("alert")
  })

  it("removes style elements and style attributes", () => {
    const clean = sanitizeTicketHtml(
      "<style>body { display: none }</style>" +
        '<p style="position:fixed;inset:0">Overlay</p>'
    )

    expect(parse(clean).querySelector("style")).toBeNull()
    expect(attributeNames(clean)).not.toContain("style")
    expect(parse(clean).textContent).toBe("Overlay")
  })

  it("strips class attributes so a sender can't restyle the app", () => {
    const clean = sanitizeTicketHtml('<p class="fixed inset-0 bg-white">Hi</p>')

    expect(attributeNames(clean)).not.toContain("class")
  })

  it("strips target so links can't reach back via window.opener", () => {
    const clean = sanitizeTicketHtml(
      '<a href="https://example.com" target="_blank">Link</a>'
    )

    expect(attributeNames(clean)).not.toContain("target")
    expect(parse(clean).querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com"
    )
  })

  it("strips data attributes", () => {
    const clean = sanitizeTicketHtml('<p data-evil="payload">Hi</p>')

    expect(attributeNames(clean)).not.toContain("data-evil")
  })

  it("neutralizes the noscript mXSS payload", () => {
    const clean = sanitizeTicketHtml(
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'
    )

    expect(attributeNames(clean)).not.toContain("onerror")
    expect(clean).not.toContain("alert")
  })

  it("leaves nothing behind when the input is only unsafe markup", () => {
    expect(sanitizeTicketHtml("<script>alert(1)</script>").trim()).toBe("")
  })
})

describe("sanitizeTicketHtml — legitimate email markup", () => {
  it("preserves basic formatting, links, and lists", () => {
    const clean = sanitizeTicketHtml(
      "<p>Hi, I <strong>can't</strong> log in.</p>" +
        '<p>See <a href="https://example.com/help" title="Help">the docs</a>.</p>' +
        "<ul><li>Tried resetting</li><li>Tried another browser</li></ul>"
    )

    const dom = parse(clean)
    expect(dom.querySelector("strong")?.textContent).toBe("can't")
    expect(dom.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/help"
    )
    expect(dom.querySelector("a")?.getAttribute("title")).toBe("Help")
    expect(dom.querySelectorAll("li")).toHaveLength(2)
  })

  it("preserves tables and images with their dimensions", () => {
    const clean = sanitizeTicketHtml(
      "<table><tbody><tr><td>Order</td><td>1234</td></tr></tbody></table>" +
        '<img src="https://example.com/logo.png" alt="Logo" width="80" height="20">'
    )

    const dom = parse(clean)
    expect(dom.querySelectorAll("td")).toHaveLength(2)

    const img = dom.querySelector("img")
    expect(img?.getAttribute("src")).toBe("https://example.com/logo.png")
    expect(img?.getAttribute("alt")).toBe("Logo")
    expect(img?.getAttribute("width")).toBe("80")
  })

  it("returns an empty string for empty input", () => {
    expect(sanitizeTicketHtml("")).toBe("")
  })
})
