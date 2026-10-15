/** players.search rule 10 (PAD-665): the line under a player-name search box, web. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { PlayerSearchFeedback } from "./PlayerSearchFeedback";
import playersEn from "../../../../../src/locales/en/players.json";
import playersPt from "../../../../../src/locales/pt/players.json";

async function instance(lng: "en" | "pt") {
  const i = i18n.createInstance();
  await i.init({
    lng,
    resources: { en: { translation: playersEn }, pt: { translation: playersPt } },
    interpolation: { escapeValue: false },
  });
  return i;
}

async function show(props: Parameters<typeof PlayerSearchFeedback>[0], lng: "en" | "pt" = "pt") {
  const i = await instance(lng);
  return render(
    <I18nextProvider i18n={i}>
      <PlayerSearchFeedback {...props} />
    </I18nextProvider>,
  );
}

describe("PlayerSearchFeedback (web)", () => {
  it("renders nothing for a blank query, whatever the state", async () => {
    const { container } = await show({ query: "   ", searching: true, count: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when something was found", async () => {
    const { container } = await show({ query: "rui", count: 3 });
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is searching, in place of the empty line", async () => {
    await show({ query: "rui", searching: true, count: 0 });
    expect(screen.getByTestId("player-search-searching")).toHaveTextContent("A pesquisar…");
    expect(screen.queryByTestId("player-search-empty")).toBeNull();
  });

  it("names the trimmed query as typed when nobody matches, in both languages", async () => {
    const pt = await show({ query: "  Xavier ", count: 0 });
    expect(screen.getByTestId("player-search-empty")).toHaveTextContent("Nenhum jogador encontrado para «Xavier»");
    pt.unmount();
    await show({ query: "  Xavier ", count: 0 }, "en");
    expect(screen.getByTestId("player-search-empty")).toHaveTextContent("No player found for “Xavier”");
  });
});
