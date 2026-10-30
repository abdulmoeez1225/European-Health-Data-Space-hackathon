import { describe, expect, it } from "vitest";

import { parseLegalLine } from "./legal";

describe("parseLegalLine", () => {
  it("splits an abbreviated article with an en dash", () => {
    expect(parseLegalLine("Art. 53 – Scientific research is an allowed purpose.")).toEqual({
      article: "53",
      text: "Scientific research is an allowed purpose.",
    });
  });

  it("splits a spelled-out article with a colon and capitalises the text", () => {
    expect(parseLegalLine("Article 69: answered as anonymised statistics.")).toEqual({
      article: "69",
      text: "Answered as anonymised statistics.",
    });
  });

  it("capitalises text that follows the dash", () => {
    expect(parseLegalLine("Art. 69 – answered as anonymised statistics.")).toEqual({
      article: "69",
      text: "Answered as anonymised statistics.",
    });
  });

  it.each([
    ["Art. 54 - hyphen separator", "54"],
    ["Art. 54 — em dash separator", "54"],
    ["Art 66 without a full stop", "66"],
    ["art. 73 – lower case", "73"],
    ["Art.68 – no space", "68"],
  ])("recognises the article in %j", (line, article) => {
    expect(parseLegalLine(line).article).toBe(article);
  });

  it("keeps a line without an article unchanged", () => {
    const line = "Anonymised statistics answer the question.";
    expect(parseLegalLine(line)).toEqual({ article: null, text: line });
  });

  it("does not treat a mention in the middle of a line as its article", () => {
    expect(parseLegalLine("See Art. 53 for the allowed purposes.").article).toBeNull();
  });

  it("does not match words that merely start with Art", () => {
    expect(parseLegalLine("Artificial intelligence is covered.").article).toBeNull();
  });
});
