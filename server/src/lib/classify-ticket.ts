import { generateObject, APICallError, RetryError } from "ai";
import { createOllama } from "ollama-ai-provider-v2";

import { TicketCategory } from "../generated/client/enums";

// Classifying reuses the same local Ollama daemon and model as reply polishing
// and summarizing: it runs on this machine, costs nothing per call, and the
// ticket never leaves the host. The model is configurable (whoever ran
// `ollama pull` decides what exists); the default is a small instruct model.
export const classifyModel = process.env.OLLAMA_MODEL ?? "llama3.2";

// Defaults to `http://127.0.0.1:11434/api`. Override when Ollama isn't on the
// same host as the API.
const ollama = createOllama(
  process.env.OLLAMA_BASE_URL ? { baseURL: process.env.OLLAMA_BASE_URL } : {},
);

// The exact set of categories the model may choose from — sourced from the
// generated Prisma enum so it can never drift from the database column. The
// model is constrained to return one of these values (enum output mode), so the
// result is always a valid `TicketCategory` and never free-form text to parse.
const CATEGORY_VALUES = Object.values(TicketCategory);

// A human-readable gloss for each category value. The enum identifiers are
// camelCase and not self-explanatory, so the model is told what each one means
// rather than left to guess from the identifier alone.
const CATEGORY_GUIDE: Record<TicketCategory, string> = {
  [TicketCategory.generalQuestion]:
    "a general question or inquiry about the product, account, pricing, or how to " +
    "do something — not a technical fault and not about money back",
  [TicketCategory.technicalQuestion]:
    "a technical problem: a bug, an error, something broken or not working, or a " +
    "request for troubleshooting help",
  [TicketCategory.refundRequest]:
    "a request for a refund, money back, a billing dispute, or cancelling for a refund",
};

// The model is classifying an incoming support email, not answering it. It is
// handed the subject and body and must choose the single best-fitting category.
// Enum output mode guarantees the value is one of `CATEGORY_VALUES`, so the
// prompt only has to convey what each category means and to pick the closest.
const SYSTEM_PROMPT = [
  "You are a support-ticket triage assistant. You are given a customer's support",
  "email (its subject and body) and must classify it into exactly one category.",
  "",
  "The categories are:",
  ...CATEGORY_VALUES.map((value) => `- ${value}: ${CATEGORY_GUIDE[value]}`),
  "",
  "Choose the single category that best fits the customer's primary intent. If it",
  "could fit more than one, pick the most specific. Do not answer or reply to the",
  "email — only classify it.",
].join("\n");

export interface TicketToClassify {
  subject: string;
  /** The customer's original message that opened the ticket. */
  body: string;
}

// The subject and body are fenced so the small model treats them as the email
// to classify rather than as instructions to follow or a message to answer.
function buildClassifyPrompt({ subject, body }: TicketToClassify): string {
  return [
    "Classify the support email below into one of the categories.",
    "",
    "--- EMAIL START ---",
    `Subject: ${subject}`,
    "",
    body,
    "--- EMAIL END ---",
  ].join("\n");
}

/**
 * Classifies a support ticket into exactly one `TicketCategory` using the local
 * model. Enum output mode constrains the model to the known category values, so
 * the return is always a valid `TicketCategory`. Throws (rather than guessing)
 * if the model or daemon fails — callers run this in the background and treat a
 * failure as "leave the ticket uncategorized".
 */
export async function classifyTicket(ticket: TicketToClassify): Promise<TicketCategory> {
  const { object } = await generateObject({
    model: ollama(classifyModel),
    output: "enum",
    enum: CATEGORY_VALUES,
    system: SYSTEM_PROMPT,
    prompt: buildClassifyPrompt(ticket),
    // Classification is a deterministic pick, not a creative task: temperature 0
    // keeps the model choosing the best-fitting category rather than varying.
    temperature: 0,
    // A daemon that isn't running won't start mid-request and a refused socket
    // fails instantly, so one retry absorbs a blip without doubling the wait.
    maxRetries: 1,
  });

  // Enum mode already guarantees `object` is one of `CATEGORY_VALUES`; the cast
  // just recovers the precise `TicketCategory` type from the plain `string`.
  return object as TicketCategory;
}

/** Why a `classifyTicket` call failed, as far as callers need to distinguish. */
export type ClassifyFailureReason = "unreachable" | "modelMissing" | "unknown";

/**
 * Classifies a failed `classifyTicket` call so callers can tell the two operator
 * problems — no daemon listening, model never pulled — apart from a generic
 * provider failure. Mirrors `summaryFailureReason` / `polishFailureReason`.
 */
export function classifyFailureReason(error: unknown): ClassifyFailureReason {
  // A refused connection is retryable, so it surfaces wrapped in a `RetryError`
  // once the single retry is spent. A 404 is not retryable, so it arrives bare.
  const apiError = APICallError.isInstance(error)
    ? error
    : RetryError.isInstance(error) && APICallError.isInstance(error.lastError)
      ? error.lastError
      : undefined;

  if (!apiError) return "unknown";

  // Ollama answers 404 for a model it hasn't pulled.
  if (apiError.statusCode === 404) return "modelMissing";

  // A refused or reset socket becomes an `APICallError` with no HTTP status.
  if (apiError.statusCode === undefined) return "unreachable";

  return "unknown";
}
