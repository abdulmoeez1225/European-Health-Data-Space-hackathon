import { describe, expect, it } from "vitest";

import { de } from "./de";
import { en } from "./en";

type Leaf = string | ((...args: never[]) => string);
type Tree = { [key: string]: Leaf | Tree } | readonly (Leaf | Tree)[];

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null;
}

/** Every leaf of a message tree, keyed by its dotted path. */
function leaves(tree: Tree, prefix = ""): Map<string, Leaf> {
  const found = new Map<string, Leaf>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTree(value)) {
      for (const [inner, leaf] of leaves(value, path)) found.set(inner, leaf);
    } else {
      found.set(path, value);
    }
  }
  return found;
}

const english = leaves(en);
const german = leaves(de);

describe("message dictionaries", () => {
  it("have plenty of messages to compare", () => {
    expect(english.size).toBeGreaterThan(400);
  });

  it("give German exactly the keys of English", () => {
    const missing = [...english.keys()].filter((path) => !german.has(path));
    const extra = [...german.keys()].filter((path) => !english.has(path));

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("keep every message the same kind in both languages: text or a function", () => {
    const mismatched = [...english]
      .filter(([path, leaf]) => typeof german.get(path) !== typeof leaf)
      .map(([path]) => path);

    expect(mismatched).toEqual([]);
  });

  it("leave no text empty in either language", () => {
    const empty = (messages: Map<string, Leaf>) =>
      [...messages].filter(([, leaf]) => typeof leaf === "string" && !leaf.trim()).map(([path]) => path);

    expect(empty(english)).toEqual([]);
    expect(empty(german)).toEqual([]);
  });

  it("take the same number of arguments in both languages", () => {
    const arity = (messages: Map<string, Leaf>) =>
      Object.fromEntries(
        [...messages]
          .filter(([, leaf]) => typeof leaf === "function")
          .map(([path, leaf]) => [path, leaf.length]),
      );

    expect(arity(german)).toEqual(arity(english));
  });
});

describe("German terms", () => {
  it("names the three decisions", () => {
    expect(de.decision.APPROVE_STATISTICAL.label).toBe("Statistik bewilligt");
    expect(de.decision.APPROVE_SPE.label).toBe("Sicherer Zugang bewilligt");
    expect(de.decision.REJECT.label).toBe("Abgelehnt");
  });

  it("words the navigation, the queue and the status marks for staff", () => {
    expect(de.shell.nav["/staff"]).toBe("Entscheidungen prüfen");
    expect(de.common.needsAttention).toBe("Benötigt Aufmerksamkeit");
  });

  it("words the staff actions", () => {
    expect(de.staff.withdraw.trigger).toBe("Entscheidung zurückziehen…");
    expect(de.staff.reopen.trigger).toBe("Zur manuellen Prüfung wieder öffnen…");
  });

  it("words the reconsideration notice for the applicant", () => {
    expect(de.letter.reopenedTitle).toBe("Wird von der Zugangsstelle erneut geprüft");
  });

  it("does not leave the English wording behind in the terms that were translated", () => {
    expect(de.decision.REJECT.label).not.toBe(en.decision.REJECT.label);
    expect(de.letter.legalBasis).not.toBe(en.letter.legalBasis);
    expect(de.smallCells.suppressedMarker).toBe("unterdrückt");
  });
});
