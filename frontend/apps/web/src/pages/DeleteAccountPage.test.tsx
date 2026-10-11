/**
 * auth.delete-account-page (PAD-603): the public page shows both ways to delete, what is deleted
 * and kept, and speaks the chosen language. `t` returns "<lang>:<key>", so the language under
 * test is visible without depending on copy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => `ui:${key}`,
    i18n: { language: "pt", getFixedT: (lng: string) => (key: string) => `${lng}:${key}` },
  }),
}));

import DeleteAccountPage from "./DeleteAccountPage";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/delete-account" element={<DeleteAccountPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe("DeleteAccountPage", () => {
  it("shows the in-app steps, the email path, what is deleted and kept, and the policy link", () => {
    renderAt("/delete-account?lang=en");
    expect(screen.getByTestId("delete-account-in-app")).toHaveTextContent("en:legal.deleteAccount.inAppSteps");
    const mailto = screen.getByTestId("delete-account-mailto");
    expect(mailto).toHaveAttribute("href", "mailto:admin@levapp.app");
    expect(mailto).toHaveTextContent("admin@levapp.app");
    expect(screen.getByTestId("delete-account-deleted").querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByTestId("delete-account-kept").querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByTestId("delete-account-privacy-link")).toHaveAttribute("href", "/privacy?lang=en");
  });

  it("follows the UI language, and ?lang= overrides it, for every string", () => {
    renderAt("/delete-account");
    expect(screen.getByTestId("delete-account-page")).toHaveAttribute("lang", "pt");
    expect(screen.getByTestId("delete-account-lang-pt")).toHaveAttribute("aria-current", "page");
    cleanup();

    renderAt("/delete-account?lang=en");
    const page = screen.getByTestId("delete-account-page");
    expect(page).toHaveAttribute("lang", "en");
    expect(page.textContent).not.toMatch(/(^|[^a-z])(pt|ui):/);
    expect(screen.getByTestId("delete-account-lang-en")).toHaveAttribute("aria-current", "page");
  });
});
