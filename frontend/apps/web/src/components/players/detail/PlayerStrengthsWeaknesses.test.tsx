/** players.notes rule 3 (PAD-889): the strength and weakness fields take at most 500 characters. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { PlayerStrengthsWeaknesses } from "./PlayerStrengthsWeaknesses";

describe("PlayerStrengthsWeaknesses — note length (PAD-889)", () => {
  it("[PLAYERS-NOTES-5] caps both note fields at 500 characters", () => {
    render(
      <PlayerStrengthsWeaknesses
        strengths={[]}
        weaknesses={[]}
        onAddStrength={vi.fn()}
        onRemoveStrength={vi.fn()}
        onAddWeakness={vi.fn()}
        onRemoveWeakness={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("common.edit"));
    expect(screen.getByTestId("sw-add-strength-input")).toHaveAttribute("maxLength", "500");
    expect(screen.getByTestId("sw-add-weakness-input")).toHaveAttribute("maxLength", "500");
  });
});
