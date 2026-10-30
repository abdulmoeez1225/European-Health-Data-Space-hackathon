import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Decision } from "@/api/types";

import { DecisionBadge } from "./DecisionBadge";

describe("DecisionBadge", () => {
  it.each<[Decision, string, string]>([
    ["REJECT", "Refused", "reject"],
    ["APPROVE_STATISTICAL", "Statistics granted", "stats"],
    ["APPROVE_SPE", "Secure access granted", "spe"],
  ])("renders %s as %s with tone %s", (decision, label, tone) => {
    render(<DecisionBadge decision={decision} />);
    expect(screen.getByText(label)).toHaveAttribute("data-tone", tone);
  });

  it("never shows the word approved", () => {
    const { container } = render(
      <>
        <DecisionBadge decision="REJECT" />
        <DecisionBadge decision="APPROVE_STATISTICAL" />
        <DecisionBadge decision="APPROVE_SPE" short />
      </>,
    );
    expect(container).not.toHaveTextContent(/approved/i);
  });

  it("shows the full label without a tooltip title by default", () => {
    render(<DecisionBadge decision="APPROVE_STATISTICAL" />);
    expect(screen.getByText("Statistics granted")).not.toHaveAttribute("title");
  });

  it.each<[Decision, string, string, string]>([
    ["REJECT", "Refused", "Refused", "reject"],
    ["APPROVE_STATISTICAL", "Statistics", "Statistics granted", "stats"],
    ["APPROVE_SPE", "Secure access", "Secure access granted", "spe"],
  ])("renders %s in short form as %s and keeps the full label as title", (decision, short, label, tone) => {
    render(<DecisionBadge decision={decision} short />);
    const badge = screen.getByText(short);
    expect(badge).toHaveAttribute("data-tone", tone);
    expect(badge).toHaveAttribute("title", label);
  });

  it.each<[Decision, string, string]>([
    ["REJECT", "bg-destructive/10", "text-destructive"],
    ["APPROVE_STATISTICAL", "bg-success/10", "text-success"],
    ["APPROVE_SPE", "bg-info/10", "text-info"],
  ])("tints %s with the %s badge variant", (decision, background, text) => {
    render(<DecisionBadge decision={decision} />);
    const badge = screen.getByText(/granted|Refused/);
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveClass(background, text);
  });

  it("hides the status dot from assistive technology", () => {
    render(<DecisionBadge decision="REJECT" />);
    const badge = screen.getByText("Refused");
    const dot = badge.querySelector("span");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toBeEmptyDOMElement();
  });
});
