import { generateText, APICallError, RetryError } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Summarizing reuses the same Gemini API and model as reply polishing, called
// through the Vercel AI SDK. The model is configurable via env var; the
// default is a small, fast Gemini model that summarizes well.
export const summaryModel = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// The provider reads `GOOGLE_GENERATIVE_AI_API_KEY` by default; this app names
// its env var `GEMINI_API_KEY` instead, so it's passed through explicitly.
const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// Unlike polishing — which is deliberately blinkered to the agent's draft — a
// summary is *about* the whole ticket, so the model is handed the subject, the
// customer's message, and every reply. The job is to condense what is already
// there for an agent skimming the ticket: never to answer it, invent details,
// or take sides.
const SYSTEM_PROMPT = [
  "You summarize a customer-support ticket and its conversation for a support",
  "agent who needs to catch up quickly. You are given the ticket subject, the",
  "customer's original message, and the agent replies so far.",
  "",
  "Write a concise, factual summary that captures the customer's issue or",
  "request, any key details, what the agent has already said or done in the",
  "replies, and the current state (resolved, waiting on the customer, still open).",
  "",
  "Rules:",
  "- Summarize only what the conversation actually says. Never invent facts,",
  "  causes, fixes, or next steps that are not present.",
  "- Do not answer the ticket or address the customer — you are briefing the",
  "  agent, not replying.",
  "- Keep it short: a few sentences or a handful of short bullet points.",
  "- Write in plain text. No preamble, headings, labels, or commentary — output",
  "  only the summary itself.",
].join("\n");

export interface TicketConversation {
  subject: string;
  /** The customer's original message that opened the ticket. */
  body: string;
  /** Agent replies in chronological order; each carries the author's name. */
  replies: { author: string; body: string }[];
}

// The conversation is fenced and each turn is labelled by speaker so the small
// model treats it as material to condense rather than a message to answer. The
// customer's opening message and each agent reply are laid out in order.
function buildSummaryPrompt({ subject, body, replies }: TicketConversation): string {
  const turns = [
    `Customer: ${body}`,
    ...replies.map((reply) => `${reply.author}: ${reply.body}`),
  ];

  return [
    "Summarize the support ticket and its conversation below.",
    "",
    `Subject: ${subject}`,
    "",
    "--- CONVERSATION START ---",
    ...turns,
    "--- CONVERSATION END ---",
    "",
    "Reply with the summary only.",
  ].join("\n");
}

// Strips the scaffolding a small local model tends to wrap around the summary:
// echoed fence markers and a leading "Here is the summary:" preamble line. Every
// rule targets an unmistakable model artifact, so real summary content survives.
function cleanSummary(text: string): string {
  const kept = text
    .split("\n")
    .filter((line) => !/^---.*---$/.test(line.trim()));

  while (kept.length > 1 && kept[0]!.trim() === "") kept.shift();
  if (kept.length > 0 && /^here('?s| is)\b[^:：]*\bsummary\b[^:：]*[:：]\s*$/i.test(kept[0]!.trim())) {
    kept.shift();
  }

  return kept.join("\n").trim();
}

/**
 * Summarizes a ticket and its conversation for an agent. A fresh summary is
 * produced on every call — nothing is persisted — so it always reflects the
 * latest replies. Throws only if the model returns nothing at all.
 */
export async function summarizeTicket(conversation: TicketConversation): Promise<string> {
  const { text } = await generateText({
    model: google(summaryModel),
    system: SYSTEM_PROMPT,
    prompt: buildSummaryPrompt(conversation),
    // A summary must stay faithful to the conversation, so a low temperature
    // keeps the model condensing what is there rather than embellishing it.
    temperature: 0.3,
    // A network blip or transient API error fails fast, so one retry absorbs it
    // without doubling the wait.
    maxRetries: 1,
  });

  const summary = cleanSummary(text);
  if (!summary) {
    throw new Error("The model returned an empty summary");
  }

  return summary;
}

/** Why a `summarizeTicket` call failed, as far as the route needs to distinguish. */
export type SummaryFailureReason = "unreachable" | "modelMissing" | "unknown";

/**
 * Classifies a failed `summarizeTicket` call so the route can tell the two
 * operator problems — no daemon listening, model never pulled — apart from a
 * generic provider failure.
 */
export function summaryFailureReason(error: unknown): SummaryFailureReason {
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
