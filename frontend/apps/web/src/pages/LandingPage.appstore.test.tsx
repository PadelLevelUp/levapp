import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import LandingPage from "./LandingPage";

/**
 * PAD-619 — auth.landing-page rule 15: the site's App Store buttons open LevApp's App Store page
 * (the same link as the install suggestion, PAD-573) in a new tab. Coaches: under the hero's ✓
 * points. Players: under the hero's ✓ points and in the closing call to action. Others: none.
 */
const renderAt = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <LandingPage />
    </MemoryRouter>,
  );

function placements() {
  return screen.queryAllByTestId("landing-app-store").map((a) => {
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("https://apps.apple.com/app/id6794271800");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    // The accessible name says where it goes and that it opens a new tab.
    expect(a.getAttribute("aria-label")).toBe("landing.appStore.aria");
    return a.getAttribute("data-placement");
  });
}

describe("App Store buttons on the landing page (PAD-619)", () => {
  it("coaches: one, under the hero's points", () => {
    renderAt("?para=treinadores");
    expect(placements()).toEqual(["hero"]);
  });

  it("players: under the hero's points and in the closing call to action", () => {
    renderAt("?para=jogadores");
    expect(placements()).toEqual(["hero", "cta"]);
  });

  it("others: none", () => {
    renderAt("?para=outros");
    expect(placements()).toEqual([]);
  });
});
