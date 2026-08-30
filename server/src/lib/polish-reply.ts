import { generateText, APICallError, RetryError } from "ai";
import { createOllama } from "ollama-ai-provider-v2";

// Ollama runs the model on this machine, so polishing costs nothing per call
// and the agent's draft never leaves the host. Which model exists is up to
// whoever ran `ollama pull`, so the choice is configurable; the default is a
// small instruct model that handles a rewrite well and loads quickly.
export const polishModel = process.env.OLLAMA_MODEL ?? "llama3.2";

// The provider defaults to `http://127.0.0.1:11434/api`. Override it when
// Ollama isn't on the same host as the API — e.g. this server in a container
// reaching a daemon on the host or in a sidecar.
const ollama = createOllama(
  process.env.OLLAMA_BASE_URL ? { baseURL: process.env.OLLAMA_BASE_URL } : {},
);

// The draft is written by an authenticated agent, and the polished text lands
// back in the reply textarea for that agent to read before sending — nothing is
// sent to the customer automatically.
//
// The job is deliberately narrow: polish the agent's draft, and only the draft.
// The draft is the agent's intended reply; the model improves how it reads
// without changing what it says or how much it says. It must not answer the
// ticket, pull in ticket details, or grow a one-line draft into a full response
// — those are the failure modes a small model falls into when handed extra
// context, so the draft is the only content it ever sees.
const SYSTEM_PROMPT = [
  "You are a meticulous copy-editor for a customer-support team. You are handed a",
  "support agent's draft reply, and the draft is the only thing you rewrite:",
  "improve its grammar, spelling, punctuation, clarity, and wording, and give it a",
  "professional, customer-friendly tone. Nothing more.",
  "",
  "You are editing existing text — not writing a reply, and not answering anyone.",
  "Re-express exactly what the draft says: do not add sentences, information, or",
  "ideas of your own, and do not drop anything it says. Keep the result the same",
  "length and scope as the draft: a short draft stays a short reply, a one-line",
  "greeting stays a brief greeting, and a single word or phrase becomes a single",
  "cleaned word or phrase. Never expand a draft into a detailed response about an",
  "issue.",
  "",
  "Rules:",
  "- Preserve every part of the draft's meaning and intent — reword it, but do",
  "  not drop anything it says or change what it commits to.",
  "- Never add facts, fixes, troubleshooting steps, questions, escalations, or",
  "  promises that the draft does not already state.",
  "- Never add details the draft does not mention, and never summarise or explain",
  "  a ticket.",
  "- Give an already-good draft only minimal edits.",
  "- Still fix mechanics even in a one-word reply: capitalize the first word and",
  '  the pronoun "I", and add end punctuation. This is editing, not adding.',
  "- Return exactly one reply. Never output more than one version, and never say",
  "  the draft needs no changes — if it is already fine, return it unchanged.",
  '- Do not add a sign-off such as "Best regards" or a name unless the draft',
  "  already has one.",
  "- Write in the draft's language.",
  "- Output only the polished reply: no preamble, labels, quotes, or commentary.",
].join("\n");

// A small local model like llama3.2 isn't steered reliably by the system prompt
// alone: handed the draft as a bare user turn, it often mistakes the draft for a
// customer's message and *answers* it, refuses with "I don't see a draft to
// review", or tacks on a preamble. Fencing the draft between explicit markers
// makes it treat the text as the content to rewrite, however short it is.
function buildPolishPrompt(draft: string): string {
  return [
    "Copy-edit the agent's draft reply between the markers below. Fix only what is",
    "between the markers, and keep the result the same length — do not add any",
    "sentences, information, or ideas that are not already in it.",
    "",
    "--- DRAFT START ---",
    draft,
    "--- DRAFT END ---",
    "",
    "Reply with the edited text only.",
  ].join("\n");
}

/**
 * A line that only narrates the model's own editing ("No changes made.", "No
 * additional edits were needed …") — never part of a customer reply. We match
 * the self-referential note but back off the moment it addresses the customer
 * ("No changes needed on your end"), which is legitimate content, not scaffolding.
 */
function isEditingNote(line: string): boolean {
  const s = line.replace(/^[\s("'*_-]+/, "").replace(/[\s)"'*_.!-]+$/, "").trim();
  if (
    !/^no\s+(additional\s+|further\s+)?(changes?|edits?|corrections?|revisions?|modifications?)\s+(are\s+|is\s+|were\s+|was\s+)?(made|needed|necessary|required)\b/i.test(
      s,
    )
  ) {
    return false;
  }
  return !/\b(you|your|you're|account|order|end)\b/i.test(s);
}

// A leading line that only announces the output ("Here's the polished reply:",
// "Here is the edited text:", "Revised version:"). Narrowed to lines that name
// the edit itself so a normal reply that legitimately opens "Here's what you
// need to do:" is kept.
function isPreamble(line: string): boolean {
  return /^(here('?s| is)\b[^:：]*\b(polish|edit|revis|correct|rewritt|rewrite|version|reply|text|result)[^:：]*|(the\s+)?(polished|edited|revised|corrected|rewritten)\b[^:：]*)[:：]\s*$/i.test(
    line.trim(),
  );
}

// Fold identical lines to a single occurrence — at temperature 0 a small model
// still occasionally stutters a short reply ("Hi,\n\nHi,\n\nHi,"). The key
// ignores case and trailing punctuation so "Hi," and "Hi" count as one line.
function dedupeKey(line: string): string {
  return line.trim().toLowerCase().replace(/[.,!?;:]+$/, "");
}

/**
 * Strips the scaffolding a small local model emits around an otherwise-correct
 * rewrite — echoed fence markers, a narrating preamble, "no changes made"
 * editing notes, and stuttered duplicate lines — so only the reply itself
 * reaches the agent. Every rule targets unmistakable model artifacts, so real
 * reply content is preserved.
 */
function cleanCompletion(text: string): string {
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // Echoed fence markers ("--- DRAFT START ---", or a "--- POLISHED REPLY ---"
    // the model invents to match), then standalone editing notes.
    if (/^---.*---$/.test(trimmed)) continue;
    if (isEditingNote(trimmed)) continue;

    // Drop an exact repeat of a non-empty line already kept.
    if (trimmed !== "") {
      const key = dedupeKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
    }

    kept.push(line);
  }

  // Then a narrating preamble, once any leading blank lines are out of the way.
  while (kept.length > 1 && kept[0]!.trim() === "") kept.shift();
  if (kept.length > 0 && isPreamble(kept[0]!)) kept.shift();

  // Capitalize the first letter. A customer reply always opens a sentence, and
  // the small model reliably leaves this undone on very short drafts ("hi", "ok")
  // — a universal mechanical fix, not phrase-specific handling.
  return kept
    .join("\n")
    .trim()
    .replace(/\p{L}/u, (c) => c.toUpperCase());
}

// The word used to address the customer when no real name is held. It is a
// generic role noun, not a guessed name — so it can never be mistaken for
// having derived a name from the email address, subject, body, or model output.
const FALLBACK_CUSTOMER_NAME = "Customer";

// Opens the reply with a "Dear {first name}," salutation. Like the signature,
// the name is spliced in here from data we hold rather than asked of the model,
// so it is always the real customer and never invented. Only the first name is
// used — a full name is split on whitespace and the rest dropped — and the
// draft is left exactly as the agent wrote it (a greeting of their own stays in
// the body); the salutation is simply prepended above it.
//
// When no usable name is held (missing or blank), the reply is still addressed,
// falling back to a generic "Dear Customer," rather than deriving a name from
// the email address, subject, body, or model output.
function greetCustomer(reply: string, customerName: string): string {
  const firstName = customerName.trim().split(/\s+/)[0] || FALLBACK_CUSTOMER_NAME;
  const salutation = `Dear ${firstName},`;
  return reply ? `${salutation}\n\n${reply}` : salutation;
}

// A valediction line — "Best regards", "Thanks,", "Sincerely," etc. A closing
// is one of these on its own line immediately above a final name line, which is
// what distinguishes a sign-off ("Thanks,\nBob") from body text that merely uses
// the same word ("Thank you.").
const VALEDICTION =
  /^(?:best|regards|best regards|kind regards|warm regards|many thanks|thanks|thank you|sincerely|cheers|yours(?: truly| sincerely| faithfully)?)[,.!]?$/i;

// True when the reply already ends with the agent's own closing, so we don't
// stack a second one on top of a signature the agent typed themselves.
function alreadySigned(reply: string, agentName: string): boolean {
  const lines = reply
    .trimEnd()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const last = lines[lines.length - 1];
  if (last && last.toLowerCase() === agentName.trim().toLowerCase()) {
    return true;
  }

  const penultimate = lines[lines.length - 2];
  return penultimate !== undefined && VALEDICTION.test(penultimate);
}

// The model is told never to sign the reply (it would otherwise invent a name
// or leave a "[Your Name]" placeholder), so the signature is appended here from
// the authenticated agent's own name — deterministic and always correct. If the
// reply already carries a closing (the agent wrote one, or a previous pass added
// ours), it is preserved as-is rather than signed a second time.
function signReply(reply: string, agentName: string): string {
  const name = agentName.trim();
  if (!name || alreadySigned(reply, name)) {
    return reply;
  }

  return `${reply}\n\nBest regards,\n${name}`;
}

export interface PolishOptions {
  /**
   * Customer's name. When the field is provided the reply is opened with a
   * "Dear {first name}," salutation; if the value is missing or blank a generic
   * "Dear Customer," is used instead. Omit the field entirely to skip the
   * salutation altogether.
   */
  customerName?: string;
  /** Agent's name; the reply is signed off with it unless it is already signed. */
  agentName?: string;
}

/**
 * Polishes an agent's draft reply — grammar, spelling, clarity, wording, tone —
 * without changing what it says or growing its scope. Throws only if the model
 * returns nothing at all; if it answers with just scaffolding (which cleanup
 * removes), the draft already reads fine and is returned unchanged.
 *
 * `customerName` opens the reply with a salutation and `agentName` signs it off.
 * Both are spliced in here and never sent to the model, so neither can leak into
 * the polished body or be reworded — the model only ever sees the draft. When
 * `customerName` is supplied but empty, the salutation falls back to a generic
 * "Dear Customer," rather than a name inferred from anywhere.
 */
export async function polishReply(draft: string, options: PolishOptions = {}): Promise<string> {
  const { text } = await generateText({
    model: ollama(polishModel),
    system: SYSTEM_PROMPT,
    prompt: buildPolishPrompt(draft),
    // Polishing is a faithful rewrite, not a creative task: temperature 0 keeps
    // the model conservative so it edits the draft instead of inventing a reply
    // around it or padding it with commentary — the failure modes a small model
    // slides into at the default sampling temperature.
    temperature: 0,
    // A daemon that isn't running won't start mid-request, and a refused socket
    // fails instantly, so one retry absorbs a blip without doubling the time an
    // agent spends watching the button spin.
    maxRetries: 1,
  });

  const raw = text.trim();
  if (!raw) {
    throw new Error("The model returned an empty reply");
  }

  // If cleanup removed everything the model produced (it answered with only
  // scaffolding or a "no changes needed" note), the draft already reads fine:
  // return it rather than erroring or letting the meta commentary through.
  let polished = cleanCompletion(text) || draft.trim();

  // Address the customer, then sign off — both from data we hold, both after the
  // model has run, so the greeting and signature bracket the polished body. A
  // supplied-but-empty `customerName` still greets (generic fallback); only an
  // absent field skips the salutation.
  if (options.customerName !== undefined) {
    polished = greetCustomer(polished, options.customerName);
  }
  if (options.agentName) {
    polished = signReply(polished, options.agentName);
  }

  return polished;
}

/** Why a `polishReply` call failed, as far as the route needs to distinguish. */
export type PolishFailureReason = "unreachable" | "modelMissing" | "unknown";

/**
 * Classifies a failed `polishReply` call so the route can tell the two operator
 * problems — no daemon listening, model never pulled — apart from a generic
 * provider failure.
 */
export function polishFailureReason(error: unknown): PolishFailureReason {
  // A refused connection is retryable, so it surfaces wrapped in a `RetryError`
  // once the single retry is spent. A 404 is not retryable, so it arrives bare.
  // Unwrap either shape before reading the status.
  const apiError = APICallError.isInstance(error)
    ? error
    : RetryError.isInstance(error) && APICallError.isInstance(error.lastError)
      ? error.lastError
      : undefined;

  if (!apiError) return "unknown";

  // Ollama answers 404 for a model it hasn't pulled.
  if (apiError.statusCode === 404) return "modelMissing";

  // The SDK converts a refused or reset socket into an `APICallError` carrying
  // no HTTP status, since no response ever came back.
  if (apiError.statusCode === undefined) return "unreachable";

  return "unknown";
}
