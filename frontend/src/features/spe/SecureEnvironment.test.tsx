import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { setLocale } from "@/i18n";
import { MOCK_PERMIT, SPE_TABLES, speResult } from "@/mock/data";
import { rememberRequest } from "@/lib/my-requests";
import { permitIssued, renderWithProviders, sampleRequest } from "@/test/render";

import { SecureEnvironment } from "./SecureEnvironment";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`permit=${MOCK_PERMIT}`),
  usePathname: () => "/spe/",
}));

const ORGANISATION = "GlucoSense, university spin-off developing clinical prediction software";
const ORGANISATION_SHORT = "GlucoSense, university spin-off develop…";

function openWorkspace() {
  const result = permitIssued(speResult(sampleRequest("R05")));
  rememberRequest(result.request_id);
  vi.spyOn(api, "request").mockResolvedValue(result);
  vi.spyOn(api, "speInfo").mockResolvedValue({ permit_id: MOCK_PERMIT, tables: SPE_TABLES });
  vi.spyOn(api, "speQuery").mockResolvedValue({
    columns: ["patient_id", "icd10"],
    rows: [["p-0000000a", "E11.9"]],
    truncated: false,
    truncated_cells: 0,
  });
  return renderWithProviders(<SecureEnvironment />);
}

describe("Secure workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    setLocale("en");
    vi.restoreAllMocks();
  });

  it("offers no download, only the Art. 73 lock line", async () => {
    openWorkspace();
    expect(await screen.findByText(/Downloads are disabled \(Art\. 73\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("pins a session bar with the permit, organisation and exact patient count", async () => {
    openWorkspace();
    const bar = await screen.findByRole("region", { name: "Secure processing environment" });
    expect(within(bar).getByText(MOCK_PERMIT)).toBeInTheDocument();
    expect(within(bar).getByText(ORGANISATION)).toBeInTheDocument();
    expect(within(bar).getByText("1,152 patients (exact)")).toBeInTheDocument();
    expect(within(bar).getByText("Every query is logged · No downloads")).toBeInTheDocument();
  });

  it("watermarks the records with permit, organisation and opening time, hidden from assistive tech", async () => {
    openWorkspace();
    const [watermark] = await screen.findAllByTestId("watermark");
    expect(watermark).toHaveAttribute("aria-hidden", "true");
    expect(watermark?.className).toMatch(/pointer-events-none/);
    expect(watermark?.textContent).toContain(`${MOCK_PERMIT} · ${ORGANISATION_SHORT} · `);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("dates the watermark the German way in German", async () => {
    setLocale("de");
    openWorkspace();
    const [watermark] = await screen.findAllByTestId("watermark");
    expect(watermark?.textContent).toMatch(/· \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
    expect(screen.getByRole("region", { name: "Sichere Verarbeitungsumgebung" }).textContent).toContain(
      "1.152 Personen (exakt)",
    );
  });
});
