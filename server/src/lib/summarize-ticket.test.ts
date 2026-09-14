import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the AI SDK's `generateText` so these tests never reach a model, while
// keeping the real `APICallError` / `RetryError` classes that
// `summaryFailureReason` depends on. `@ai-sdk/google` is stubbed too, so module
// load doesn't construct a real provider — the returned "model" is opaque and
// only ever forwarded to the mocked `generateText`.
const generateTextMock = vi.fn();

vi.mock("ai", async (importActual) => ({
  ...(await importActual<typeof import("ai")>()),
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => "mock-model",
}));

import { APICallError, RetryError } from "ai";

import {
  summarizeTicket,
  summaryFailureReason,
  type TicketConversation,
} from "./summarize-ticket";

function lastCall() {
  return generateTextMock.mock.calls[0]![0] as {
    system: string;
    prompt: string;
    temperature: number;
  };
}

const conversation: TicketConversation = {
  subject: "Can't log in",
  body: "I forgot my password and the reset email never arrives.",
  replies: [
    { author: "Alice Agent", body: "I've re-sent the reset email — check your spam folder." },
    { author: "Bob Agent", body: "Glad it worked, closing this out." },
  ],
};

beforeEach(() => {
  generateTextMock.mockReset();
});

describe("summarizeTicket", () => {
  it("feeds the subject, customer message, and every reply to the model", async () => {
    generateTextMock.mockResolvedValue({ text: "Summary." });

    await summarizeTicket(conversation);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const { prompt } = lastCall();
    expect(prompt).toContain("Can't log in");
    expect(prompt).toContain("I forgot my password and the reset email never arrives.");
    expect(prompt).toContain("Alice Agent: I've re-sent the reset email — check your spam folder.");
    expect(prompt).toContain("Bob Agent: Glad it worked, closing this out.");
  });

  it("labels the opening message as the customer's", async () => {
    generateTextMock.mockResolvedValue({ text: "Summary." });

    await summarizeTicket(conversation);

    expect(lastCall().prompt).toContain(
      "Customer: I forgot my password and the reset email never arrives.",
    );
  });

  it("summarizes a ticket that has no replies yet", async () => {
    generateTextMock.mockResolvedValue({ text: "Customer forgot their password." });

    await expect(
      summarizeTicket({ ...conversation, replies: [] }),
    ).resolves.toBe("Customer forgot their password.");

    // The customer's message is still there; there is simply nothing after it.
    const { prompt } = lastCall();
    expect(prompt).toContain("Customer: I forgot my password and the reset email never arrives.");
    expect(prompt).not.toContain("Alice Agent");
  });

  it("instructs the model to summarize rather than answer, and to stay factual", async () => {
    generateTextMock.mockResolvedValue({ text: "Summary." });

    await summarizeTicket(conversation);

    const { system } = lastCall();
    expect(system).toMatch(/summariz/i);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/do not answer the ticket/i);
  });

  it("returns the model's summary, trimmed", async () => {
    generateTextMock.mockResolvedValue({ text: "  The customer could not log in.  " });

    await expect(summarizeTicket(conversation)).resolves.toBe(
      "The customer could not log in.",
    );
  });

  it("strips echoed fence markers around the summary", async () => {
    generateTextMock.mockResolvedValue({
      text: "--- CONVERSATION START ---\nThe customer could not log in.\n--- CONVERSATION END ---",
    });

    await expect(summarizeTicket(conversation)).resolves.toBe(
      "The customer could not log in.",
    );
  });

  it("strips a narrating 'Here is the summary:' preamble line", async () => {
    generateTextMock.mockResolvedValue({
      text: "Here is the summary:\n\nThe customer could not log in; the agent re-sent the email.",
    });

    await expect(summarizeTicket(conversation)).resolves.toBe(
      "The customer could not log in; the agent re-sent the email.",
    );
  });

  it("keeps bullet points and line breaks intact", async () => {
    const summary = "- Customer could not log in.\n- Agent re-sent the reset email.\n- Resolved.";
    generateTextMock.mockResolvedValue({ text: summary });

    await expect(summarizeTicket(conversation)).resolves.toBe(summary);
  });

  it("uses a low temperature so the summary stays faithful", async () => {
    generateTextMock.mockResolvedValue({ text: "Summary." });

    await summarizeTicket(conversation);

    expect(lastCall().temperature).toBeLessThanOrEqual(0.3);
  });

  it("throws rather than return an empty string when the model returns nothing", async () => {
    generateTextMock.mockResolvedValue({ text: "   " });

    await expect(summarizeTicket(conversation)).rejects.toThrow(/empty/i);
  });

  it("throws when the model returns only scaffolding that cleans away to nothing", async () => {
    generateTextMock.mockResolvedValue({
      text: "--- CONVERSATION START ---\n--- CONVERSATION END ---",
    });

    await expect(summarizeTicket(conversation)).rejects.toThrow(/empty/i);
  });
});

describe("summaryFailureReason", () => {
  it("classifies a 404 as a missing model", () => {
    const error = new APICallError({
      message: 'model "llama3.2" not found, try pulling it first',
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      statusCode: 404,
    });

    expect(summaryFailureReason(error)).toBe("modelMissing");
  });

  it("classifies a status-less API error as unreachable", () => {
    const error = new APICallError({
      message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      isRetryable: true,
    });

    expect(summaryFailureReason(error)).toBe("unreachable");
  });

  it("unwraps a RetryError to reach the underlying unreachable cause", () => {
    const error = new RetryError({
      message: "Failed after 2 attempts",
      reason: "maxRetriesExceeded",
      errors: [
        new APICallError({
          message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
          url: "http://127.0.0.1:11434/api/chat",
          requestBodyValues: {},
          isRetryable: true,
        }),
      ],
    });

    expect(summaryFailureReason(error)).toBe("unreachable");
  });

  it("classifies anything else as unknown", () => {
    expect(summaryFailureReason(new Error("rate limited"))).toBe("unknown");
  });
});
