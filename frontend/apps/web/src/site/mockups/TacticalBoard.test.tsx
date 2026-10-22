/** PAD-656: the tactical-board mock keeps its accessible name, caption, tokens and reduced-motion guard. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { TacticalBoard } from "./TacticalBoard";

describe("TacticalBoard", () => {
  it("is one labelled image with the caption outside it", () => {
    render(<TacticalBoard />);
    const img = screen.getByRole("img", { name: "site.coaches.board.label" });
    const caption = screen.getByText("site.coaches.board.caption");
    expect(caption.tagName).toBe("P");
    expect(img.contains(caption)).toBe(false);
    expect(screen.getByTestId("site-tactical-board").contains(caption)).toBe(true);
  });

  it("shows the four player tokens", () => {
    render(<TacticalBoard />);
    for (const id of ["A1", "A2", "B1", "B2"]) expect(screen.getByText(id)).toBeTruthy();
  });

  it("disables the loop under prefers-reduced-motion", () => {
    const { container } = render(<TacticalBoard />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toContain("animation:none");
  });
});
