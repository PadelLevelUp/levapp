import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt", changeLanguage: () => undefined } }),
}));
vi.mock("@/lib/hubspot", () => ({
  demoFormId: () => null,
  hasMarketingSubscription: () => false,
  loadTrackingScript: () => undefined,
}));
// A dark system theme: what made the banner, the dialog and the form dark on the white site.
vi.stubGlobal(
  "matchMedia",
  (query: string) =>
    ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
);

import { useForcedTheme } from "@/lib/forcedTheme";
import { SiteFrame } from "./SiteFrame";

function Themed({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={useForcedTheme()}>
      {children}
    </ThemeProvider>
  );
}

/** PAD-656: the public site is light-only, whatever the system theme. */
describe("SiteFrame forces the light theme", () => {
  it("paints <html> light under a dark system theme while the site is mounted, and lets go after", () => {
    const { unmount } = render(
      <Themed>
        <MemoryRouter>
          <SiteFrame audience="coaches" onAudienceChange={() => undefined}>
            {() => <p>page</p>}
          </SiteFrame>
        </MemoryRouter>
      </Themed>,
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    unmount();
    render(
      <Themed>
        <p>app</p>
      </Themed>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
