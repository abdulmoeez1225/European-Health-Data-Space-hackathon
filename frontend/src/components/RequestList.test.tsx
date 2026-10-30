import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { burgenlandResult, rejectResult, speResult } from "@/mock/data";
import { renderWithProviders, reopened, sampleRequest, withdrawn } from "@/test/render";

import { RequestList } from "./RequestList";

const flagged = rejectResult(sampleRequest("R02"));
const plain = burgenlandResult(sampleRequest("R01"), 32, null);
const pulled = withdrawn(speResult(sampleRequest("R05")));
const reconsidered = reopened(rejectResult(sampleRequest("R03")));
const results = [flagged, plain, pulled, reconsidered];

function renderList({ staff }: { staff: boolean }) {
  const onSelect = vi.fn();
  renderWithProviders(
    <RequestList
      label="Decisions"
      results={results}
      selectedId={null}
      onSelect={onSelect}
      selectOnArrow={false}
      staff={staff}
    />,
  );
  return { onSelect, row: (id: string) => screen.getByRole("button", { name: new RegExp(id) }) };
}

describe("RequestList: staff", () => {
  it("marks a decision that needs attention", () => {
    const { row } = renderList({ staff: true });

    expect(within(row("R02")).getByText("Needs attention:")).toBeInTheDocument();
    expect(within(row("R02")).queryByText("Withdrawn:")).not.toBeInTheDocument();
  });

  it("marks a withdrawn decision, and only as a status, not as a badge", () => {
    const { row } = renderList({ staff: true });

    expect(within(row("R05")).getByText("Withdrawn:")).toBeInTheDocument();
    expect(within(row("R05")).queryByText("Needs attention:")).not.toBeInTheDocument();
    expect(within(row("R05")).queryByText("Withdrawn")).not.toBeInTheDocument();
  });

  it("marks a reopened refusal as reopened, and only as a status, not as a badge", () => {
    const { row } = renderList({ staff: true });

    expect(within(row("R03")).getByText("Reopened:")).toBeInTheDocument();
    expect(within(row("R03")).queryByText("Needs attention:")).not.toBeInTheDocument();
    expect(within(row("R03")).queryByText("Withdrawn:")).not.toBeInTheDocument();
    expect(within(row("R03")).queryByText("Reconsidering")).not.toBeInTheDocument();
  });

  it("marks nothing on a plainly issued decision", () => {
    const { row } = renderList({ staff: true });

    expect(within(row("R01")).queryByText("Needs attention:")).not.toBeInTheDocument();
    expect(within(row("R01")).queryByText("Withdrawn:")).not.toBeInTheDocument();
  });

  it("selects the clicked decision", async () => {
    const user = userEvent.setup();
    const { onSelect, row } = renderList({ staff: true });

    await user.click(row("R01"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("R01");
  });
});

describe("RequestList: applicant", () => {
  it("badges a withdrawn decision", () => {
    const { row } = renderList({ staff: false });

    expect(within(row("R05")).getByText("Withdrawn")).toBeInTheDocument();
  });

  it("badges a reopened refusal as reconsidering", () => {
    const { row } = renderList({ staff: false });

    expect(within(row("R03")).getByText("Reconsidering")).toBeInTheDocument();
    expect(within(row("R03")).queryByText("Withdrawn")).not.toBeInTheDocument();
    expect(within(row("R05")).queryByText("Reconsidering")).not.toBeInTheDocument();
  });

  it("badges nothing on issued decisions and never shows the staff marks", () => {
    const { row } = renderList({ staff: false });

    for (const id of ["R02", "R01"]) {
      expect(within(row(id)).queryByText("Withdrawn")).not.toBeInTheDocument();
      expect(within(row(id)).queryByText("Reconsidering")).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Needs attention:")).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn:")).not.toBeInTheDocument();
    expect(screen.queryByText("Reopened:")).not.toBeInTheDocument();
  });
});
