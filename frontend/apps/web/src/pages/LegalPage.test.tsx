/**
 * auth.legal-pages (PAD-601): the page renders the markdown body with its version header, the
 * language switch, and the Portuguese fallback notice. Asserted by test id, never by copy
 * (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import LegalPage from "./LegalPage";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/terms" element={<LegalPage document="terms" />} />
        <Route path="/privacy" element={<LegalPage document="privacy" />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(cleanup);

// auth.legal-pages rule 1: markdown only, no raw HTML and no scheme smuggling through links.
vi.mock("@/content/legal", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/content/legal")>();
  return {
    ...real,
    LEGAL_DOCUMENTS: {
      ...real.LEGAL_DOCUMENTS,
      privacy: {
        ...real.LEGAL_DOCUMENTS.privacy,
        bodies: {
          en: "# Privacy Policy\n\nEffective date: October 2, 2026\n\n<script>window.pwned = 1</script>\n\n[bad](javascript:alert(1)) and [fine](/terms)\n",
        },
      },
    },
  };
});

describe("LegalPage", () => {
  it("renders the English terms with the version header", () => {
    renderAt("/terms");
    expect(screen.getByTestId("legal-version")).toHaveTextContent("2026-10-10");
    expect(screen.getByTestId("legal-effective-date")).toHaveTextContent("October 10, 2026");
    expect(screen.getByTestId("legal-body").querySelector("h1")).toHaveTextContent("Terms of Service");
    expect(screen.queryByTestId("legal-fallback-notice")).toBeNull();
    expect(screen.getByTestId("legal-lang-en")).toHaveAttribute("aria-current", "page");
  });

  it("renders the privacy policy with its own version", () => {
    renderAt("/privacy");
    expect(screen.getByTestId("legal-version")).toHaveTextContent("2026-10-10");
    expect(screen.getByTestId("legal-body").querySelector("h1")).toHaveTextContent("Privacy Policy");
  });

  it("shows the English body under the Portuguese notice while PT is in preparation", () => {
    renderAt("/terms?lang=pt");
    expect(screen.getByTestId("legal-fallback-notice")).toHaveTextContent("legal.portugueseInPreparation");
    expect(screen.getByTestId("legal-body").querySelector("h1")).toHaveTextContent("Terms of Service");
    expect(screen.getByTestId("legal-lang-pt")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("legal-terms")).toHaveAttribute("lang", "en");
  });

  it("keeps internal links as router links and keeps the language on the cross link", () => {
    renderAt("/terms?lang=pt");
    const footer = screen.getByTestId("legal-footer");
    expect(footer.querySelector('a[href="/privacy?lang=pt"]')).toBeTruthy();
    expect(footer.querySelector('a[href="/auth"]')).toBeTruthy();
    const body = screen.getByTestId("legal-body");
    expect(body.querySelector('a[href="/privacy"]')).toBeTruthy(); // the Terms text links to the Privacy Policy
  });
});

describe("LegalPage safety (rule 1)", () => {
  it("renders no raw HTML and no javascript: href from the markdown", () => {
    renderAt("/privacy");
    const body = screen.getByTestId("legal-body");
    // Without rehype-raw, react-markdown shows the tag as literal text: no element, nothing runs.
    expect(body.querySelector("script")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    const links = Array.from(body.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links.some((h) => (h ?? "").toLowerCase().startsWith("javascript:"))).toBe(false);
    expect(links).toContain("/terms");
  });
});
