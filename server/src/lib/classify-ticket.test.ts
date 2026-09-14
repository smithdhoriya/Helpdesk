import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the AI SDK's `generateObject` so these tests never reach a model, while
// keeping the real `APICallError` / `RetryError` classes that
// `classifyFailureReason` depends on. `@ai-sdk/google` is stubbed too, so
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

import { TicketCategory } from "../generated/client/enums";
import { classifyFailureReason, classifyTicket } from "./classify-ticket";

function lastCall() {
  return generateObjectMock.mock.calls[0]![0] as {
    system: string;
    prompt: string;
    temperature: number;
    output: string;
    enum: string[];
  };
}

const ticket = {
  subject: "Refund for my duplicate charge",
  body: "I was billed twice this month and would like one charge refunded.",
};

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("classifyTicket", () => {
  it("feeds the subject and body to the model", async () => {
    generateObjectMock.mockResolvedValue({ object: TicketCategory.refundRequest });

    await classifyTicket(ticket);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const { prompt } = lastCall();
    expect(prompt).toContain("Refund for my duplicate charge");
    expect(prompt).toContain("I was billed twice this month and would like one charge refunded.");
  });

  it("returns the category the model selected", async () => {
    generateObjectMock.mockResolvedValue({ object: TicketCategory.refundRequest });

    await expect(classifyTicket(ticket)).resolves.toBe(TicketCategory.refundRequest);
  });

  it("constrains the model to the known category values via enum output mode", async () => {
    generateObjectMock.mockResolvedValue({ object: TicketCategory.generalQuestion });

    await classifyTicket(ticket);

    const { output, enum: options } = lastCall();
    expect(output).toBe("enum");
    // The options must be exactly the Prisma enum values, so the saved category
    // can never drift from what the DB column accepts.
    expect(options).toEqual(Object.values(TicketCategory));
  });

  it("lists every category, with a description, in the system prompt", async () => {
    generateObjectMock.mockResolvedValue({ object: TicketCategory.generalQuestion });

    await classifyTicket(ticket);

    const { system } = lastCall();
    for (const value of Object.values(TicketCategory)) {
      expect(system).toContain(value);
    }
    expect(system).toMatch(/classif/i);
    expect(system).toMatch(/do not answer/i);
  });

  it("uses a deterministic (zero) temperature so the pick is stable", async () => {
    generateObjectMock.mockResolvedValue({ object: TicketCategory.generalQuestion });

    await classifyTicket(ticket);

    expect(lastCall().temperature).toBe(0);
  });

  it("propagates a provider failure to the caller", async () => {
    generateObjectMock.mockRejectedValue(new Error("model exploded"));

    await expect(classifyTicket(ticket)).rejects.toThrow(/model exploded/);
  });
});

describe("classifyFailureReason", () => {
  it("classifies a 404 as a missing model", () => {
    const error = new APICallError({
      message: 'model "llama3.2" not found, try pulling it first',
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      statusCode: 404,
    });

    expect(classifyFailureReason(error)).toBe("modelMissing");
  });

  it("classifies a status-less API error as unreachable", () => {
    const error = new APICallError({
      message: "Cannot connect to API: connect ECONNREFUSED 127.0.0.1:11434",
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
      isRetryable: true,
    });

    expect(classifyFailureReason(error)).toBe("unreachable");
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

    expect(classifyFailureReason(error)).toBe("unreachable");
  });

  it("classifies anything else as unknown", () => {
    expect(classifyFailureReason(new Error("rate limited"))).toBe("unknown");
  });
});
