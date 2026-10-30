import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { QueryResult, SpeTable } from "@/api/types";
import { renderWithProviders } from "@/test/render";

import { BrowseTab } from "./BrowseTab";

const TABLES: SpeTable[] = [
  { name: "cohort", rows: 3, columns: ["patient_id"] },
  { name: "conditions", rows: 120, columns: ["patient_id", "icd10", "description", "onset_date"] },
  { name: "medications", rows: 80, columns: ["patient_id", "atc", "name", "start_date"] },
];

type Pending = { sql: string; resolve: (result: QueryResult) => void };

/** Every query waits until the test answers it, so responses can arrive in any order. */
function controlledQueries() {
  const pending: Pending[] = [];
  vi.spyOn(api, "speQuery").mockImplementation(
    (_permit, sql) =>
      new Promise<QueryResult>((resolve) => {
        pending.push({ sql, resolve });
      }),
  );
  const answer = (match: (sql: string) => boolean, result: QueryResult) => {
    for (const request of pending.filter((candidate) => match(candidate.sql))) request.resolve(result);
  };
  return { pending, answer };
}

const rowsOf = (column: string, value: string): QueryResult => ({
  columns: ["patient_id", column],
  rows: [["p-0000000a", value]],
  truncated: false,
});
const total = (n: number): QueryResult => ({ columns: ["n"], rows: [[n]], truncated: false });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BrowseTab: switching tables", () => {
  it("resets filters and page, and never queries a column of the previous table", async () => {
    const user = userEvent.setup();
    const { pending, answer } = controlledQueries();
    renderWithProviders(<BrowseTab permitId="permit-R05" tables={TABLES} />);

    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await act(async () => {
      answer((sql) => sql.startsWith("SELECT count"), total(120));
      answer((sql) => sql.includes("FROM conditions"), rowsOf("icd10", "E11.9"));
    });
    await user.type(screen.getByLabelText(/ICD-10 starts with/), "E11");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(pending.some((p) => /starts_with/.test(p.sql))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Medications/ }));

    // The new table has its own, empty filters and starts on the first page.
    expect(screen.queryByLabelText(/ICD-10 starts with/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/ATC starts with/)).toHaveValue("");
    const sent = pending.filter((p) => p.sql.includes("FROM medications")).map((p) => p.sql);
    expect(sent.length).toBeGreaterThan(0);
    for (const sql of sent) {
      expect(sql).not.toMatch(/icd10/);
      expect(sql).not.toMatch(/OFFSET [1-9]/);
    }
  });

  it("renders only the latest table's result, even if an older response arrives later", async () => {
    const user = userEvent.setup();
    const { pending, answer } = controlledQueries();
    renderWithProviders(<BrowseTab permitId="permit-R05" tables={TABLES} />);
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));

    // Leave the conditions query unanswered, switch, answer medications first, then conditions.
    await user.click(screen.getByRole("button", { name: /Medications/ }));
    await act(async () => {
      answer((sql) => sql.startsWith("SELECT count"), total(80));
      answer(
        (sql) => sql.startsWith("SELECT *") && sql.includes("FROM medications"),
        rowsOf("atc", "A10BA02"),
      );
    });
    await act(async () => {
      answer((sql) => sql.includes("FROM conditions"), rowsOf("icd10", "E11.9"));
    });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("A10BA02")).toBeInTheDocument();
    expect(within(table).queryByText("E11.9")).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "ATC" })).toBeInTheDocument();
  });

  it("shows a loading area of stable height while a table loads", async () => {
    controlledQueries();
    renderWithProviders(<BrowseTab permitId="permit-R05" tables={TABLES} />);

    const loading = await screen.findByRole("status", { name: /Loading/ });
    expect(loading.className).toMatch(/h-\[480px\]/);
  });
});
