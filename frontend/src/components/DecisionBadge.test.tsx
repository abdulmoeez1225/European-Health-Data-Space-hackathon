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

  it("keeps the label and tone at the large size", () => {
    render(<DecisionBadge decision="APPROVE_SPE" size="lg" />);
    expect(screen.getByText("Approved – secure environment")).toHaveAttribute("data-tone", "spe");
  });

  it("hides the decorative icon from assistive technology", () => {
    const { container } = render(<DecisionBadge decision="REJECT" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
