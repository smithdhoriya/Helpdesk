import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the AI SDK's `generateObject` so these tests never reach a model, while
// keeping the real `APICallError` / `RetryError` classes that
// `autoResolveFailureReason` depends on. `@ai-sdk/google` is stubbed too, so
// module load doesn't construct a real provider — the returned "model" is
// opaque and only ever forwarded to the mocked `generateObject`.
const generateObjectMock = vi.fn();

vi.mock("ai", async (importActual) => ({
  ...(await importActual<typeof import("ai")>()),
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => "mock-model",
}));

import { APICallError, RetryError } from "ai";

import { autoResolveFailureReason, autoResolveTicket } from "./auto-resolve-ticket";

function lastCall() {
  return generateObjectMock.mock.calls[0]![0] as {
    system: string;
    prompt: string;
    temperature: number;
    maxRetries: number;
  };
}

const knowledgeBase = "## Password resets\nCustomers can reset their password from the login page.";

const ticket = {
  subject: "How do I reset my password?",
  body: "I can't remember my password and need to get back in.",
  customerName: "Alice Johnson",
};

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("autoResolveTicket", () => {
  it("feeds the subject, body, and knowledge base to the model", async () => {
    generateObjectMock.mockResolvedValue({
      object: { canResolve: true, reply: "Reset it from the login page." },
    });

    await autoResolveTicket(ticket, knowledgeBase);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const { prompt } = lastCall();
    expect(prompt).toContain("How do I reset my password?");
    expect(prompt).toContain("I can't remember my password and need to get back in.");
    expect(prompt).toContain(knowledgeBase);
  });

  it("uses a deterministic (zero) temperature so the decision is stable", async () => {
    generateObjectMock.mockResolvedValue({
      object: { canResolve: true, reply: "Reset it from the login page." },
    });

    await autoResolveTicket(ticket, knowledgeBase);

    expect(lastCall().temperature).toBe(0);
  });

  it("frames the model's reply body with a first-name salutation and a fixed signature", async () => {
    generateObjectMock.mockResolvedValue({
      object: { canResolve: true, reply: "Reset it from the login page." },
    });

    const result = await autoResolveTicket(ticket, knowledgeBase);

    expect(result.canResolve).toBe(true);
    expect(result.reply).toBe(
      "Hi Alice,\n\nReset it from the login page.\n\nBest regards,\nAdmin",
    );
  });

  it("greets generically when no customer name was captured, never guessing one", async () => {
    generateObjectMock.mockResolvedValue({
      object: { canResolve: true, reply: "Reset it from the login page." },
    });

    const result = await autoResolveTicket(
      { ...ticket, customerName: null },
      knowledgeBase,
    );

    expect(result.reply).toBe(
      "Hi there,\n\nReset it from the login page.\n\nBest regards,\nAdmin",
    );
  });

  it("withholds (canResolve false, null reply) when the model declines to resolve", async () => {
    generateObjectMock.mockResolvedValue({ object: { canResolve: false, reply: "" } });

    const result = await autoResolveTicket(ticket, knowledgeBase);

    expect(result).toEqual({ canResolve: false, reply: null });
  });

  it("withholds when the model says yes but returns an empty reply body", async () => {
    // A "yes" with nothing to send has no reply to post, so it must be treated as
    // not resolvable rather than sending an empty message.
    generateObjectMock.mockResolvedValue({ object: { canResolve: true, reply: "   " } });

    const result = await autoResolveTicket(ticket, knowledgeBase);

    expect(result).toEqual({ canResolve: false, reply: null });
  });

  it("propagates a provider failure to the caller", async () => {
    generateObjectMock.mockRejectedValue(new Error("model exploded"));

    await expect(autoResolveTicket(ticket, knowledgeBase)).rejects.toThrow(/model exploded/);
  });
});

describe("autoResolveFailureReason", () => {
  it("classifies a 404 as a missing model", () => {
    const error = new APICallError({
      message: 'model "llama3.2" not found, try pulling it first',
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      statusCode: 404,
    });

    expect(autoResolveFailureReason(error)).toBe("modelMissing");
  });

  it("classifies a status-less API error as unreachable", () => {
    const error = new APICallError({
      message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      isRetryable: true,
    });

    expect(autoResolveFailureReason(error)).toBe("unreachable");
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

    expect(autoResolveFailureReason(error)).toBe("unreachable");
  });

  it("classifies anything else as unknown", () => {
    expect(autoResolveFailureReason(new Error("rate limited"))).toBe("unknown");
  });
});
