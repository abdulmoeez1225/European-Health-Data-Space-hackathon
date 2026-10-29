const ARTICLE_PREFIX = /^Art(?:icle|\.)?\s*(\d+)\s*[:–—-]?\s*/i;

export type LegalLine = { article: string | null; text: string };

/** "Art. 53 – Scientific research is allowed." -> { article: "53", text: "Scientific research is allowed." } */
export function parseLegalLine(line: string): LegalLine {
  const match = ARTICLE_PREFIX.exec(line);
  if (!match?.[1]) return { article: null, text: line };
  const text = line.slice(match[0].length);
  return { article: match[1], text: text.charAt(0).toUpperCase() + text.slice(1) };
}

/** Cited articles that no legal-basis line explains, so they can still be shown. */
export function uncoveredArticles(articles: string[], legalBasis: string[]): string[] {
  const covered = new Set(legalBasis.map((line) => parseLegalLine(line).article));
  return articles.filter((article) => !covered.has(article));
}
