import { describe, expect, it } from "vitest";
import { AiDraftSchema, AiGistSchema, docToPlainText, readabilityReport } from "./ai.js";

describe("readabilityReport", () => {
  it("counts words and sentences and scores plain prose as easy", () => {
    const r = readabilityReport("Bitcoin rose today. Traders in Lagos were calm. Fees stayed low.");
    expect(r.words).toBe(11);
    expect(r.sentences).toBe(3);
    expect(r.readingEase).toBeGreaterThan(60);
    expect(r.longSentences).toEqual([]);
  });

  it("flags long sentences, hype and unexplained jargon", () => {
    const long = Array.from({ length: 35 }, (_, i) => `word${i}`).join(" ") + ".";
    const r = readabilityReport(`${long} This token offers guaranteed returns and is risk-free. Yield farming is also popular. Staking is a way to earn rewards. A stablecoin (a token pegged to a currency) helps.`);
    expect(r.longSentences).toHaveLength(1);
    expect(r.redFlags.map((f) => f.phrase.toLowerCase())).toEqual(["guaranteed returns", "risk-free"]);
    expect(r.jargon).toContain("yield farming");
    expect(r.jargon).not.toContain("stablecoin"); // explained in brackets
    expect(r.jargon).not.toContain("staking"); // "is a ..."
  });

  it("handles empty text", () => {
    expect(readabilityReport("")).toMatchObject({ words: 0, readingEase: 0, readingMinutes: 1 });
  });
});

describe("docToPlainText", () => {
  it("joins blocks with blank lines and keeps inline text together", () => {
    const doc = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why it matters" }] },
      { type: "paragraph", content: [{ type: "text", text: "Fees are " }, { type: "text", text: "falling", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }] },
    ] };
    expect(docToPlainText(doc)).toBe("Why it matters\n\nFees are falling.\n\nOne");
  });
});

describe("request schemas", () => {
  const postId = "00000000-0000-4000-8000-000000000001";
  it("needs enough material to work from", () => {
    expect(AiGistSchema.safeParse({ postId, title: "T", text: "short" }).success).toBe(false);
    expect(AiDraftSchema.safeParse({ postId, title: "T", notes: "too short" }).success).toBe(false);
    expect(AiGistSchema.safeParse({ postId, title: "T", text: "x".repeat(200) }).success).toBe(true);
  });
  it("rejects unknown fields", () => {
    expect(AiGistSchema.safeParse({ postId, title: "T", text: "x".repeat(200), publish: true }).success).toBe(false);
  });
});
