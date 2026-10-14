import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

// Radix's checkbox and radio group measure themselves with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

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
      expect(cta.getAttribute("href")).toMatch(/^mailto:admin@levapp\.app\?subject=/);
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

  it("tells the demo buttons from \"Falar connosco\" (PAD-650)", () => {
    vi.stubEnv("VITE_HUBSPOT_DEMO_FORM_ID", "form-123");
    renderPage();

    const ctas = screen.getAllByTestId("landing-demo-cta");
    const talk = ctas.filter((c) => c.textContent?.includes("landing.how.cta"));
    expect(talk).toHaveLength(1);
    expect(talk[0]).not.toHaveAttribute("data-pedido");
    for (const cta of ctas.filter((c) => c !== talk[0])) {
      expect(cta).toHaveAttribute("data-pedido", "demonstracao");
    }
  });

  it("shows the marketing box only when the build has a subscription id (PAD-650)", () => {
    vi.stubEnv("VITE_HUBSPOT_DEMO_FORM_ID", "form-123");
    vi.stubEnv("VITE_HUBSPOT_MARKETING_SUBSCRIPTION_ID", "");
    const first = renderPage();
    fireEvent.click(screen.getAllByTestId("landing-demo-cta")[0]);
    expect(screen.getByTestId("demo-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-marketing")).toBeNull();
    first.unmount();

    vi.stubEnv("VITE_HUBSPOT_MARKETING_SUBSCRIPTION_ID", "4242");
    renderPage();
    fireEvent.click(screen.getAllByTestId("landing-demo-cta")[0]);
    expect(screen.getByTestId("demo-marketing")).toBeInTheDocument();
  });
});
