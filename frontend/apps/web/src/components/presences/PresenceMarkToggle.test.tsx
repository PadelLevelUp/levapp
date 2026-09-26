/**
 * PAD-441 (attendance.validation rule 26): each selected mark reads as its own colour, from
 * `presenceMarkTone`, with a full-strength border as the non-colour cue; unselected options stay
 * neutral. Asserted on `data-tone` and the tone's token classes, never on rendered copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PresenceMark } from "@levelup/config";
import { PresenceMarkToggle } from "./PresenceMarkToggle";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "en" } };
  return { useTranslation: () => translation };
});

function renderWith(value: PresenceMark | null) {
  render(<PresenceMarkToggle value={value} onChange={() => {}} playerName="Rui" />);
}

describe("PresenceMarkToggle colours (PAD-441)", () => {
  it.each([
    ["present", "positive", "border-success"],
    ["justified", "warning", "border-warning"],
    ["unjustified", "negative", "border-destructive"],
  ] as const)("a selected %s option is %s with a full-strength border", (mark, tone, border) => {
    renderWith(mark);
    const button = screen.getByTestId(`presence-mark-${mark}`);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-tone", tone);
    expect(button.className.split(/\s+/)).toContain(border);
  });

  it("leaves every unselected option neutral", () => {
    renderWith("justified");
    for (const mark of ["present", "unjustified"]) {
      const button = screen.getByTestId(`presence-mark-${mark}`);
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button).toHaveAttribute("data-tone", "neutral");
    }
  });
});
