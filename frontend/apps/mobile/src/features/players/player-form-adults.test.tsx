import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

/** PAD-642 (players.create rule 10; owner: "forbid under-18"): on the create screen the coach ticks
 * "I confirm this student is 18 or older" before either save. The edit screen has no box. */
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
// Real useFieldAvailability since PAD-406 (stubbed before); its one api call finds no conflict.
vi.mock("@levelup/api/src/resources/fields", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkFieldConflict: async () => null,
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { PlayerForm } from "./PlayerForm";

async function mount(requireAdultConfirmation: boolean) {
  const onSubmit = vi.fn();
  const n = await renderNative(
    createElement(PlayerForm, { levels: [], submitLabel: "save", onSubmit, requireAdultConfirmation })
  );
  await n.changeText("player-name", "Ana Adult");
  return { n, onSubmit };
}

describe("PlayerForm — adults only (PAD-642)", () => {
  it("does not save until the coach confirms the student is an adult", async () => {
    const { n, onSubmit } = await mount(true);
    await n.press("player-save");
    expect(onSubmit).not.toHaveBeenCalled();
    await n.press("player-confirms-adults");
    await n.press("player-save");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("shows no box on the edit screen", async () => {
    const { n } = await mount(false);
    expect(n.queryByTestId("player-confirms-adults")).toBeNull();
  });
});
