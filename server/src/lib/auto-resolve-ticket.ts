import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject, APICallError, RetryError } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

// Auto-resolution reuses the same Gemini API and model as the other AI
// features, called through the Vercel AI SDK. The model is configurable via
// env var; the default is a small, fast Gemini model.
export const autoResolveModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// The provider reads `GOOGLE_GENERATIVE_AI_API_KEY` by default; this app names
// its env var `GEMINI_API_KEY` instead, so it's passed through explicitly.
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// The knowledge base lives at the server package root, next to `package.json`.
// Resolved relative to this source file (this module is at `src/lib/`) so it is
// found regardless of the process's working directory.
const KNOWLEDGE_BASE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../knowledge-base.md");

let cachedKnowledgeBase: string | null = null;

/**
 * Reads the support knowledge base from disk, cached after the first read (the
 * file is static for the life of the process). Kept separate from
 * `autoResolveTicket` so the resolution logic stays pure and testable — the
 * worker loads the file and hands the text in.
 */
export function loadKnowledgeBase(): string {
  if (cachedKnowledgeBase === null) {
    cachedKnowledgeBase = readFileSync(KNOWLEDGE_BASE_PATH, "utf8");
  }
  return cachedKnowledgeBase;
}

// The model is answering an incoming support email from the knowledge base
// alone. Two things make an auto-reply safe to send unattended: the answer is
// actually in the knowledge base, and none of the knowledge base's own
// escalation rules apply. The model is told to withhold (`canResolve: false`,
// leaving the ticket for a human) whenever either is in doubt — a false negative
// just means an agent handles it, while a false positive sends a wrong or
// premature answer to a customer.
const SYSTEM_PROMPT = [
  "You are a first-line customer-support assistant for Code with Mosh. You decide",
  "whether an incoming support email can be safely answered automatically using",
  "ONLY the knowledge base provided below, and if so, you write that reply.",
  "",
  "You must set canResolve to false (leave the ticket for a human agent) whenever",
  "ANY of these is true:",
  "- The knowledge base does not clearly and completely answer the customer's",
  "  question. If you would have to guess, assume facts, or fill gaps, do not resolve.",
  "- The email matches any escalation rule in the knowledge base's escalation",
  "  section (e.g. legal threats, a refund requested outside the 30-day window, a",
  "  chargeback or payment dispute, or an account-security concern).",
  "- The email needs account-specific action or data you cannot see (looking up an",
  "  order, changing an email, issuing a refund).",
  "- You are otherwise unsure.",
  "",
  "Only set canResolve to true when the knowledge base plainly answers the",
  "question and no escalation rule applies.",
  "",
  "When canResolve is true, write the reply body only:",
  "- Answer strictly from the knowledge base. Never invent policies, steps, links,",
  "  numbers, or promises that are not in it.",
  "- Be concise, clear, and professional.",
  "- Do NOT add a greeting/salutation or a sign-off/signature — those are added",
  "  separately. Write only the body of the reply.",
  "",
  "When canResolve is false, return an empty string for reply.",
].join("\n");

export interface TicketToResolve {
  subject: string;
  /** The customer's original message that opened the ticket. */
  body: string;
  /** The customer's name, when captured — used only for the salutation. */
  customerName?: string | null;
}

// The model's structured answer. Enum/schema output keeps the decision a real
// boolean and the reply a plain string, so there is nothing free-form to parse.
const resolutionSchema = z.object({
  canResolve: z
    .boolean()
    .describe("true only if the knowledge base fully answers the email and no escalation rule applies"),
  reply: z
    .string()
    .describe("the reply body to send when canResolve is true; an empty string otherwise"),
});

/** A safe auto-resolution decision for a ticket. */
export interface AutoResolution {
  /** Whether the ticket can be answered automatically from the knowledge base. */
  canResolve: boolean;
  /**
   * The full customer-facing reply (salutation + body + sign-off) when
   * `canResolve` is true; `null` when the ticket should be left for a human.
   */
  reply: string | null;
}

// The customer's email is fenced so the small model treats it as the message to
// evaluate rather than as instructions to follow. The knowledge base is fenced
// separately as the only source of truth it may answer from.
function buildResolvePrompt(
  { subject, body }: TicketToResolve,
  knowledgeBase: string,
): string {
  return [
    "Knowledge base (the only source you may answer from):",
    "--- KNOWLEDGE BASE START ---",
    knowledgeBase,
    "--- KNOWLEDGE BASE END ---",
    "",
    "Incoming support email:",
    "--- EMAIL START ---",
    `Subject: ${subject}`,
    "",
    body,
    "--- EMAIL END ---",
    "",
    "Decide whether this email can be safely resolved from the knowledge base",
    "alone, and if so write the reply body.",
  ].join("\n");
}

// The word used to address the customer when no real name is held. A generic
// role noun, not a guessed name — so it can never be mistaken for a name derived
// from the email address, subject, or body.
const FALLBACK_CUSTOMER_NAME = "there";

// The reply is signed by the automated assistant on behalf of the support team,
// never a real person, so the customer isn't misled about who answered.
const SIGNATURE = "Best regards,\nAdmin";

// Frames the model's reply body with a salutation and a fixed signature, both
// spliced in here rather than asked of the model, so the model can never invent
// a customer or agent name. Only the customer's first name is used when one was
// captured; otherwise a generic "Hi there," opens the reply.
function frameReply(replyBody: string, customerName?: string | null): string {
  const firstName = customerName?.trim().split(/\s+/)[0];
  const salutation = `Hi ${firstName || FALLBACK_CUSTOMER_NAME},`;
  return `${salutation}\n\n${replyBody.trim()}\n\n${SIGNATURE}`;
}

/**
 * Decides whether an incoming ticket can be safely answered from the knowledge
 * base, and if so returns the full customer-facing reply. Answers only from the
 * supplied knowledge base and refuses (returns `canResolve: false`) whenever the
 * answer isn't clearly there or an escalation rule applies — the conservative
 * choice, since a withheld ticket just goes to a human. Throws (rather than
 * guessing) if the model or daemon fails; the worker treats that as "leave the
 * ticket for a human" and retries.
 */
export async function autoResolveTicket(
  ticket: TicketToResolve,
  knowledgeBase: string,
): Promise<AutoResolution> {
  const { object } = await generateObject({
    model: google(autoResolveModel),
    schema: resolutionSchema,
    system: SYSTEM_PROMPT,
    prompt: buildResolvePrompt(ticket, knowledgeBase),
    // Deciding and answering from a fixed knowledge base is a faithful task, not
    // a creative one: temperature 0 keeps the model grounded in the knowledge
    // base rather than embellishing an answer or resolving on a hunch.
    temperature: 0,
    // A network blip or transient API error fails fast, so one retry absorbs it
    // without doubling the wait.
    maxRetries: 1,
  });

  // Guard against the model saying "yes" but returning nothing to send: without
  // a body there is no reply to post, so treat it as not resolvable.
  const replyBody = object.reply.trim();
  if (!object.canResolve || !replyBody) {
    return { canResolve: false, reply: null };
  }

  return { canResolve: true, reply: frameReply(replyBody, ticket.customerName) };
}

/** Why an `autoResolveTicket` call failed, as far as the worker needs to distinguish. */
export type AutoResolveFailureReason = "unreachable" | "modelMissing" | "unknown";

/**
 * Classifies a failed `autoResolveTicket` call so the worker can tell the two
 * operator problems — no daemon listening, model never pulled — apart from a
 * generic provider failure. Mirrors `classifyFailureReason` / `polishFailureReason`.
 */
export function autoResolveFailureReason(error: unknown): AutoResolveFailureReason {
  // A refused connection is retryable, so it surfaces wrapped in a `RetryError`
  // once the single retry is spent. A 404 is not retryable, so it arrives bare.
  const apiError = APICallError.isInstance(error)
    ? error
    : RetryError.isInstance(error) && APICallError.isInstance(error.lastError)
      ? error.lastError
      : undefined;

  if (!apiError) return "unknown";

  // Google answers 404 for an unknown/unavailable model name.
  if (apiError.statusCode === 404) return "modelMissing";

  // A refused or reset socket becomes an `APICallError` with no HTTP status.
  if (apiError.statusCode === undefined) return "unreachable";

  return "unknown";
}
