import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import LandingPage from "./LandingPage";

/**
 * auth.landing-page rule 5 (PAD-469): "Pedir demonstração" is the HubSpot
 * dialog only when the build carries a demo form ID; otherwise it stays the
 * support mailto. The E2E server always sets an ID, so the unset case lives here.
 */
describe("landing page demo CTA", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

  it("is a mailto to support when the build has no demo form ID", () => {
    vi.stubEnv("VITE_HUBSPOT_DEMO_FORM_ID", "");
    renderPage();

    const ctas = screen.getAllByTestId("landing-demo-cta");
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta.tagName).toBe("A");
      expect(cta.getAttribute("href")).toMatch(/^mailto:padellevelup2026@gmail\.com\?subject=/);
    }
  });

  it("is a button that opens the dialog when the build has one", () => {
    vi.stubEnv("VITE_HUBSPOT_DEMO_FORM_ID", "form-123");
    renderPage();

    const ctas = screen.getAllByTestId("landing-demo-cta");
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta.tagName).toBe("BUTTON");
      expect(cta).not.toHaveAttribute("href");
    }
  });
});
