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
  // R-032: the page rendered (its hero is there) before counting what it has.
  expect(screen.getByTestId("landing-hero")).toBeInTheDocument();
  return screen.queryAllByTestId("landing-app-store").map((a) => {
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("https://apps.apple.com/app/id6794271800");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    // WCAG 2.5.3: the accessible name is the visible text, then the new-tab note.
    expect(a).toHaveAccessibleName("landing.appStore.eyebrow landing.appStore.name landing.appStore.newTab");
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
