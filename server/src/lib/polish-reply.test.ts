import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub the AI SDK's `generateText` so these tests never reach a model, while
// keeping the real `APICallError` / `RetryError` classes that
// `polishFailureReason` depends on. `ollama-ai-provider-v2` is stubbed too, so
// module load doesn't try to construct a real provider — the returned "model"
// is opaque and only ever forwarded to the mocked `generateText`.
const generateTextMock = vi.fn();

vi.mock("ai", async (importActual) => ({
  ...(await importActual<typeof import("ai")>()),
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: () => () => "mock-model",
}));

import { polishReply } from "./polish-reply";

function lastCall() {
  return generateTextMock.mock.calls[0]![0] as { system: string; prompt: string };
}

beforeEach(() => {
  generateTextMock.mockReset();
});

describe("polishReply", () => {
  it("sends the agent's exact draft to the AI provider", async () => {
    generateTextMock.mockResolvedValue({ text: "Polished." });
    const draft = "hey fixed it try again";

    await polishReply(draft);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    // The draft is the only content polished — it must reach the model verbatim.
    expect(lastCall().prompt).toContain(draft);
  });

  it("does not send any ticket context to the AI provider", async () => {
    generateTextMock.mockResolvedValue({ text: "Polished." });

    // The model only ever sees the draft. The customer and agent names are
    // spliced in afterwards, so even when both are supplied neither they nor any
    // ticket subject/customer message reach the prompt.
    await polishReply("hi", { customerName: "Jane Doe", agentName: "Alice Agent" });

    const { system, prompt } = lastCall();
    expect(system).toMatch(/only thing you rewrite/i);
    expect(system).toMatch(/never add details the draft does not mention/i);
    expect(system).toMatch(/short draft stays a short reply/i);
    expect(prompt).not.toMatch(/ticket context/i);
    expect(prompt).not.toMatch(/customer message/i);
    expect(prompt).not.toContain("Jane");
    expect(prompt).not.toContain("Alice");
    expect(system).not.toContain("Jane");
    expect(system).not.toContain("Alice");
  });

  // Short drafts are valid input, not something to reject or inflate. The unit
  // test can only assert the draft is passed through untouched and returned; the
  // "stays short" behaviour itself is a model behaviour verified live.
  it.each(["hi", "thanks", "hey fixed it try again", "we will check this and update you"])(
    "accepts the short draft %j and forwards it verbatim",
    async (draft) => {
      generateTextMock.mockResolvedValue({ text: "Polished." });

      await expect(polishReply(draft)).resolves.toBe("Polished.");
      expect(lastCall().prompt).toContain(draft);
    },
  );

  it("returns the model's polished text, trimmed", async () => {
    generateTextMock.mockResolvedValue({ text: "  Thank you for reaching out.  " });

    await expect(polishReply("thanks")).resolves.toBe("Thank you for reaching out.");
  });

  it("strips a narrating preamble line the model sometimes prepends", async () => {
    generateTextMock.mockResolvedValue({
      text: "Here's the polished reply:\n\nHey, I've fixed the issue. Please try again.",
    });

    await expect(polishReply("hey fixed it try again")).resolves.toBe(
      "Hey, I've fixed the issue. Please try again.",
    );
  });

  it("strips an 'edited text' narrating preamble too", async () => {
    generateTextMock.mockResolvedValue({
      text: "Here is the edited text:\n\nHey, fixed it. Try again.",
    });

    await expect(polishReply("hey fixed it try again")).resolves.toBe(
      "Hey, fixed it. Try again.",
    );
  });

  it("strips fence markers the model echoes back around the reply", async () => {
    generateTextMock.mockResolvedValue({
      text: "--- POLISHED REPLY START ---\nThank you for reaching out.\n--- POLISHED REPLY END ---",
    });

    await expect(polishReply("thanks")).resolves.toBe("Thank you for reaching out.");
  });

  it("collapses a stuttered short reply and drops a trailing editing note", async () => {
    // The exact reported bug: a short draft comes back repeated with a
    // "No changes made" note tacked on. The agent must see one clean greeting.
    generateTextMock.mockResolvedValue({ text: "Hi,\n\nHi,\n\nHi,\n\nNo changes made." });

    const result = await polishReply("hi");

    expect(result).toBe("Hi,");
    expect(result).not.toMatch(/no changes/i);
  });

  it("removes a 'no changes needed' note that follows a real reply", async () => {
    generateTextMock.mockResolvedValue({
      text: "Thank you for reaching out.\n\nNo changes needed.",
    });

    await expect(polishReply("thanks")).resolves.toBe("Thank you for reaching out.");
  });

  it("falls back to the original draft when the model returns only an editing note", async () => {
    // A non-empty response that is pure meta must never surface to the agent,
    // and must not error — the untouched draft is the acceptable result.
    generateTextMock.mockResolvedValue({ text: "No changes needed." });

    await expect(polishReply("thanks")).resolves.toBe("thanks");
  });

  it("keeps a real sentence that merely starts with 'no changes'", async () => {
    // "No changes needed on your end" addresses the customer — it is content,
    // not the model narrating its own edits, so it must be preserved.
    const reply = "No changes are needed on your end, everything looks fine.";
    generateTextMock.mockResolvedValue({ text: reply });

    await expect(polishReply("all good on your side")).resolves.toBe(reply);
  });

  it("leaves a well-formed multi-sentence reply intact", async () => {
    const reply =
      "Hello, I checked your account, and everything looks fine. Please try again.";
    generateTextMock.mockResolvedValue({ text: reply });

    await expect(
      polishReply("hello i checked your account and everything looks fine please try again"),
    ).resolves.toBe(reply);
  });

  it("capitalizes the first letter the model leaves lowercase on a short reply", async () => {
    // llama3.2 reliably skips this on one-word drafts; cleanup guarantees it
    // generically (no per-phrase handling).
    generateTextMock.mockResolvedValue({ text: "hi" });

    await expect(polishReply("hi")).resolves.toBe("Hi");
  });

  it("generates with temperature 0 so the model rewrites rather than invents", async () => {
    generateTextMock.mockResolvedValue({ text: "Polished." });

    await polishReply("draft");

    expect(generateTextMock.mock.calls[0]![0]).toMatchObject({ temperature: 0 });
  });

  it("throws rather than return an empty string when the model returns nothing", async () => {
    generateTextMock.mockResolvedValue({ text: "   " });

    await expect(polishReply("draft")).rejects.toThrow(/empty/i);
  });

  it("signs the polished reply with the agent's name when one is given", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you for reaching out." });

    await expect(polishReply("thanks", { agentName: "Alice Agent" })).resolves.toBe(
      "Thank you for reaching out.\n\nBest regards,\nAlice Agent",
    );
  });

  it("does not send the agent's name to the model — the signature is added in code", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await polishReply("thanks", { agentName: "Alice Agent" });

    const { system, prompt } = lastCall();
    expect(system).not.toContain("Alice");
    expect(prompt).not.toContain("Alice");
  });

  it("signs the fallback draft too when the model returns only meta", async () => {
    generateTextMock.mockResolvedValue({ text: "No changes needed." });

    await expect(polishReply("thanks", { agentName: "Alice Agent" })).resolves.toBe(
      "thanks\n\nBest regards,\nAlice Agent",
    );
  });

  it("does not add a signature when no agent name is given", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await expect(polishReply("thanks")).resolves.toBe("Thank you.");
  });

  it("does not add a signature for a blank agent name", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await expect(polishReply("thanks", { agentName: "   " })).resolves.toBe("Thank you.");
  });

  it("does not sign twice when the reply already ends with the agent's name", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you.\n\nBest regards,\nAlice Agent" });

    await expect(polishReply("thanks", { agentName: "Alice Agent" })).resolves.toBe(
      "Thank you.\n\nBest regards,\nAlice Agent",
    );
  });

  it("preserves a closing the agent already wrote rather than adding a second", async () => {
    // The draft ended with the agent's own sign-off (a different name than the
    // authenticated agent): it must be kept as-is, not stacked with another.
    generateTextMock.mockResolvedValue({
      text: "Thanks so much for your patience.\n\nRegards,\nBob",
    });

    await expect(
      polishReply("thanks so much for your patience regards bob", { agentName: "Admin" }),
    ).resolves.toBe("Thanks so much for your patience.\n\nRegards,\nBob");
  });

  it("still signs a short reply whose body merely uses the word 'thank you'", async () => {
    // "Thank you." is body text, not a closing (no name line follows), so the
    // agent's signature is still added.
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await expect(polishReply("thanks", { agentName: "Admin" })).resolves.toBe(
      "Thank you.\n\nBest regards,\nAdmin",
    );
  });

  it("opens the reply with a 'Dear {first name},' salutation", async () => {
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    await expect(polishReply("refund done", { customerName: "Jane" })).resolves.toBe(
      "Dear Jane,\n\nYour refund has been processed.",
    );
  });

  it("uses only the supplied customer name — never a word from the draft or reply", async () => {
    // Regression for the "Dear It," bug: the greeting name comes solely from the
    // caller-supplied `customerName`. Even when the draft and the model's reply
    // are full of stray capitalized words ("It", "Password"), none of them can
    // become the salutation — only "Alice" (the real name) is used.
    generateTextMock.mockResolvedValue({ text: "It looks like your Password was reset." });

    const result = await polishReply("it looks like your password was reset", {
      customerName: "Alice Johnson",
    });

    expect(result).toBe("Dear Alice,\n\nIt looks like your Password was reset.");
    expect(result).not.toMatch(/^Dear It,/);
    expect(result).not.toMatch(/^Dear Password,/);
  });

  it("skips the salutation entirely when the customerName field is omitted", async () => {
    // The salutation is opt-in at the API level: with no `customerName` field at
    // all, the reply is never prefixed with a "Dear …,". A blank field, by
    // contrast, still greets (see the fallback tests) — only omission skips it.
    generateTextMock.mockResolvedValue({ text: "It has been resolved." });

    const result = await polishReply("it has been resolved");

    expect(result).toBe("It has been resolved.");
    expect(result).not.toMatch(/^Dear\b/);
  });

  it("addresses the customer by first name only, never the last name", async () => {
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    const result = await polishReply("refund done", { customerName: "Alice Johnson" });

    expect(result).toBe("Dear Alice,\n\nYour refund has been processed.");
    expect(result).not.toContain("Alice Johnson");
    expect(result).not.toContain("Johnson");
    // The salutation is always "Dear", never "Hi"/"Hello".
    expect(result).not.toMatch(/^(hi|hello)\b/i);
  });

  it("leaves the agent's own greeting in the body rather than folding it away", async () => {
    generateTextMock.mockResolvedValue({ text: "Hi there, I looked into your account." });

    await expect(
      polishReply("hi there i looked into your account", { customerName: "Jane" }),
    ).resolves.toBe("Dear Jane,\n\nHi there, I looked into your account.");
  });

  it("addresses the customer even when the whole draft was a bare greeting", async () => {
    generateTextMock.mockResolvedValue({ text: "Hi" });

    await expect(polishReply("hi", { customerName: "Jane" })).resolves.toBe("Dear Jane,\n\nHi");
  });

  it("falls back to 'Dear Customer,' for a blank customer name", async () => {
    // A supplied-but-blank name (whitespace only) still greets — the reply is
    // always addressed — but with the generic fallback, never a guessed name.
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await expect(polishReply("thanks", { customerName: "   " })).resolves.toBe(
      "Dear Customer,\n\nThank you.",
    );
  });

  it("falls back to 'Dear Customer,' for an empty customer name", async () => {
    // The route passes "" (not undefined) when the ticket has no captured
    // sender name, so this is the real missing-name path.
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    const result = await polishReply("refund done", { customerName: "" });

    expect(result).toBe("Dear Customer,\n\nYour refund has been processed.");
    // The fallback is a generic role noun, never a name pulled from the draft.
    expect(result).not.toMatch(/^Dear (Refund|Done),/);
  });

  it("uses the real first name when one exists, never the fallback", async () => {
    // The paired case to the fallback: a real name is greeted by first name only
    // ("Dear Alice,"), and "Customer" never appears.
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    const result = await polishReply("refund done", { customerName: "Alice Johnson" });

    expect(result).toBe("Dear Alice,\n\nYour refund has been processed.");
    expect(result).not.toContain("Customer");
    expect(result).not.toContain("Johnson");
  });

  it("greets a named customer and falls back for a nameless one, otherwise identically", async () => {
    // Both cases share the same polished body and signature; only the salutation
    // differs — a real first name vs. the generic fallback.
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    await expect(
      polishReply("refund done", { customerName: "Alice Johnson", agentName: "Admin" }),
    ).resolves.toBe("Dear Alice,\n\nYour refund has been processed.\n\nBest regards,\nAdmin");

    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    await expect(
      polishReply("refund done", { customerName: "", agentName: "Admin" }),
    ).resolves.toBe("Dear Customer,\n\nYour refund has been processed.\n\nBest regards,\nAdmin");
  });

  it("greets the customer, polishes the middle, and signs off in one pass", async () => {
    generateTextMock.mockResolvedValue({ text: "Your refund has been processed." });

    await expect(
      polishReply("refund done", { customerName: "Alice Johnson", agentName: "Admin" }),
    ).resolves.toBe("Dear Alice,\n\nYour refund has been processed.\n\nBest regards,\nAdmin");
  });

  it("produces the documented Dear-{first name} reply for the spec's example draft", async () => {
    // Locks the exact end-to-end contract from the feature spec: full customer
    // name "Alice Johnson" is greeted by first name only ("Dear Alice,"), the
    // agent's draft is the body, and the signature closes it — in one pass.
    generateTextMock.mockResolvedValue({
      text: "Hey, we've fixed the issue. Please try again.",
    });

    await expect(
      polishReply("hey fixed the issue please try again", {
        customerName: "Alice Johnson",
        agentName: "Admin",
      }),
    ).resolves.toBe(
      "Dear Alice,\n\nHey, we've fixed the issue. Please try again.\n\nBest regards,\nAdmin",
    );
  });

  it("does not send the customer's name to the model — the salutation is added in code", async () => {
    generateTextMock.mockResolvedValue({ text: "Thank you." });

    await polishReply("thanks", { customerName: "Jane" });

    const { system, prompt } = lastCall();
    expect(system).not.toContain("Jane");
    expect(prompt).not.toContain("Jane");
  });
});
