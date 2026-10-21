/**
 * PAD-656 (auth.landing-page): the new site's chrome. The audience is `?para=` (rule 4), the header
 * hides its section links on "Outros", the ☰ menu carries the links and both buttons, and the footer
 * goes to the real contact, legal and cookie targets.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import SitePage from "./SitePage";

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

const renderSite = (url = "/") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SitePage />
      <Search />
    </MemoryRouter>,
  );

async function choose(audience: string) {
  // Radix opens the menu on pointerdown (jsdom has no pointer capture), so drive it with the keyboard.
  fireEvent.keyDown(screen.getByTestId("site-audience"), { key: "Enter" });
  fireEvent.click(await screen.findByTestId(`site-audience-${audience}`));
}

describe("the site layout (PAD-656)", () => {
  it("opens on coaches and writes ?para= when the audience changes, without a reload", async () => {
    renderSite("/?utm_source=x");
    expect(screen.getByTestId("site-page-coaches")).toBeInTheDocument();
    await choose("players");
    expect(screen.getByTestId("site-page-players")).toBeInTheDocument();
    expect(screen.getByTestId("search").textContent).toBe("?utm_source=x&para=jogadores");
  });

  it("reads the audience from the URL, the old ?audience= too", () => {
    renderSite("/?audience=alunos");
    expect(screen.getByTestId("site-audience").getAttribute("data-audience")).toBe("players");
  });

  it("shows the section links for coaches and players and hides them on Outros", async () => {
    renderSite();
    const nav = screen.getByTestId("site-nav");
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#vantagens", "#como-funciona", "#resultados"]);
    await choose("others");
    expect(within(screen.getByTestId("site-nav")).queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByTestId("site-page-others")).toBeInTheDocument();
  });

  it("the ☰ menu carries the links and both buttons, and closes after a link", () => {
    renderSite();
    const burger = screen.getByTestId("site-burger");
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    const menu = screen.getByTestId("site-menu");
    expect(within(menu).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#vantagens", "#como-funciona", "#resultados", "/auth"]);
    expect(within(menu).getByRole("button", { name: "site.layout.demo" })).toBeInTheDocument();
    fireEvent.click(within(menu).getAllByRole("link")[0]);
    expect(screen.queryByTestId("site-menu")).toBeNull();
  });

  it("the footer goes to /contacto, /privacy and /terms and offers the cookie preferences", () => {
    renderSite();
    expect(screen.getByTestId("site-footer-contact").getAttribute("href")).toBe("/contacto");
    expect(screen.getByTestId("site-footer-privacy").getAttribute("href")).toBe("/privacy");
    expect(screen.getByTestId("site-footer-terms").getAttribute("href")).toBe("/terms");
    expect(screen.getByTestId("cookie-preferences")).toBeInTheDocument();
  });
});
