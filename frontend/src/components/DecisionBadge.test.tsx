import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Decision } from "@/api/types";

import { DecisionBadge } from "./DecisionBadge";

describe("DecisionBadge", () => {
  it.each<[Decision, string, string]>([
    ["REJECT", "Rejected", "reject"],
    ["APPROVE_STATISTICAL", "Approved – statistics", "stats"],
    ["APPROVE_SPE", "Approved – secure environment", "spe"],
  ])("renders %s as %s with tone %s", (decision, label, tone) => {
    render(<DecisionBadge decision={decision} />);
    expect(screen.getByText(label)).toHaveAttribute("data-tone", tone);
  });

  it("shows the full label without a tooltip title by default", () => {
    render(<DecisionBadge decision="APPROVE_STATISTICAL" />);
    expect(screen.getByText("Approved – statistics")).not.toHaveAttribute("title");
  });

  it.each<[Decision, string, string, string]>([
    ["REJECT", "Rejected", "Rejected", "reject"],
    ["APPROVE_STATISTICAL", "Statistics", "Approved – statistics", "stats"],
    ["APPROVE_SPE", "Secure env.", "Approved – secure environment", "spe"],
  ])("renders %s in short form as %s and keeps the full label as title", (decision, short, label, tone) => {
    render(<DecisionBadge decision={decision} short />);
    const badge = screen.getByText(short);
    expect(badge).toHaveAttribute("data-tone", tone);
    expect(badge).toHaveAttribute("title", label);
  });

  it("hides the status dot from assistive technology", () => {
    render(<DecisionBadge decision="REJECT" />);
    const badge = screen.getByText("Rejected");
    const dot = badge.querySelector("span");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toBeEmptyDOMElement();
  });
});
