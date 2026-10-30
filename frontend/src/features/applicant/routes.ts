/** View-state keys shared by the request form and the decision page. */
export const DRAFT_KEY = "applicant.draft";
export const SAMPLE_KEY = "applicant.sample";
/** What the form was last filled with (a sample, imported JSON or nothing), to detect edits. */
export const BASELINE_KEY = "applicant.baseline";
/** The request decided in this tab a moment ago, for the "Decision ready" toast. */
export const JUST_DECIDED_KEY = "applicant.justDecided";

/** The decision page is My requests with ?id= (static export: no dynamic routes). */
export function decisionHref(requestId: string): string {
  return `/requests/?id=${encodeURIComponent(requestId)}`;
}
