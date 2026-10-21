import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
let formId: string | null = "form-1";
vi.mock("@/lib/hubspot", () => ({
  demoFormId: () => formId,
  hasMarketingSubscription: () => false,
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { SiteDemoProvider, useSiteDemo } from "./SiteDemo";

function Opener() {
  const demo = useSiteDemo();
  return demo.open ? (
    <button data-testid="open" onClick={() => demo.open?.("demonstracao")}>
      open
    </button>
  ) : (
    <a data-testid="mailto" href={demo.mailtoHref}>
      mail
    </a>
  );
}

const renderSite = () =>
  render(
    <MemoryRouter>
      <SiteDemoProvider>
        <Opener />
      </SiteDemoProvider>
    </MemoryRouter>,
  );

/** PAD-656: the new site opens the one contact dialog from anywhere under the layout. */
describe("SiteDemoProvider", () => {
  it("opens the contact dialog from a section's button", () => {
    formId = "form-1";
    renderSite();
    expect(screen.queryByTestId("demo-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open"));
    expect(screen.getByTestId("demo-dialog")).toBeTruthy();
  });

  it("falls back to the mailto link when the build has no form id", () => {
    formId = null;
    renderSite();
    expect(screen.getByTestId("mailto").getAttribute("href")).toMatch(/^mailto:admin@levapp\.app\?subject=/);
  });
});
