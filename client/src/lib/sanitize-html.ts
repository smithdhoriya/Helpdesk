import DOMPurify from "dompurify"

// `Ticket.bodyHtml` is the HTML part of an inbound support email, so it is
// fully attacker-controlled: anyone who can email support controls its
// contents. It's the only value in the app rendered via
// `dangerouslySetInnerHTML`, so it must pass through here first.
//
// The allowlists are explicit rather than DOMPurify's defaults to keep the
// surface small:
// - No `script`/`style`/`iframe`/`object`/`svg`/`math`, so there is no element
//   that can execute script or smuggle it through mXSS.
// - No `style` or `class` attribute, so a sender can't restyle the app shell
//   around their message (overlays, hidden click targets).
// - No `target`, so a link can't open a new tab and reach back via
//   `window.opener` (reverse tabnabbing).
// Event-handler attributes (`onerror`, `onclick`, …) and `javascript:` URLs are
// rejected by DOMPurify itself and can't be re-enabled by this config.
const ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]

const ALLOWED_ATTR = ["alt", "height", "href", "src", "title", "width"]

/**
 * Sanitizes the HTML part of a ticket for rendering. Returns safe HTML, which
 * may be an empty string if every element in the input was unsafe.
 */
export function sanitizeTicketHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}
