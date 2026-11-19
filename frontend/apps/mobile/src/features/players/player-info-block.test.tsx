/**
 * players.profile rule 8 (PAD-834): Block 1 (Informação) on iOS edits on its own, sends only what
 * changed, and blocks Guardar on an empty required select only in the "Completar informação"
 * session. The screen's wiring (header edit disabled while Block 1 edits) is pinned by its source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { CoachLevel, CoachPlayer } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
// The real select is a native picker sheet; a stand-in whose options are pressable by id.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const { Pressable, View, Text } = await import("react-native");
  type Opt = { value: string; label: string } | undefined;
  const Ctx = React.createContext<{ value?: Opt; onValueChange?: (o: Opt) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: Opt; onValueChange?: (o: Opt) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({ testID, children }: { testID?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(View, { testID, accessibilityHint: ctx.value?.value ?? "" }, children);
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SelectItem: ({ value, label }: { value: string; label: string }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(Pressable, { testID: `option-${value}`, onPress: () => ctx.onValueChange?.({ value, label }) },
        React.createElement(Text, null, label));
    },
  };
});

import { PlayerInfoBlock } from "./player-info-block";

const LEVELS: CoachLevel[] = [{ id: "L1", coachId: "1", code: "I1", label: "Iniciação" } as CoachLevel];
const rui = {
  id: "cp-1", coachId: "1", playerId: "1", userId: "10", name: "Rui", email: "rui@example.pt", phone: "912000000",
  isActive: true, validated: true, levelId: "L1", side: "left", level: LEVELS[0], notes: "", pendingRegistration: false,
} as unknown as CoachPlayer;
const tiago = { ...rui, levelId: undefined, level: undefined } as CoachPlayer;

async function mount(player: CoachPlayer, session: "edit" | "complete" | null, levels = LEVELS) {
  const onSave = vi.fn(async () => {});
  const onCancel = vi.fn();
  const n = await renderNative(
    createElement(PlayerInfoBlock, { player, levels, session, onEdit: () => {}, onCancel, onSave }),
  );
  return { n, onSave, onCancel };
}

describe("PlayerInfoBlock on iOS (PAD-834)", () => {
  it("[PLAYERS-PROFILE-12] the same on iOS", async () => {
    // Cancel sends nothing.
    const a = await mount(rui, "edit");
    await a.n.changeText("player-info-phone-input", "913000000");
    await a.n.press("player-info-cancel");
    expect(a.onCancel).toHaveBeenCalledTimes(1);
    expect(a.onSave).not.toHaveBeenCalled();
    // A registered student's e-mail is their login: no box for it.
    expect(a.n.queryByTestId("player-info-email-input")).toBeNull();

    // Save sends only the changed phone.
    const b = await mount(rui, "edit");
    await b.n.changeText("player-info-phone-input", "913000000");
    await b.n.press("player-info-save");
    expect(b.onSave).toHaveBeenCalledWith({ phone: "913000000" });

    // The screen disables the header edit while Block 1 edits, and Block 1's Editar while the header form is open.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toMatch(/testID="player-edit"[\s\S]{0,200}disabled=\{[^}]*infoSession !== null\}/);
    expect(screen).toMatch(/<PlayerInfoBlock[\s\S]{0,400}editDisabled=\{isEditing\}/);
    expect(screen).toContain("identityOnly");
  });

  it("[PLAYERS-PROFILE-22] the same on iOS", async () => {
    // No levels: Nível is not required, so a phone saves from "Completar informação".
    const bea = await mount(tiago, "complete", []);
    await bea.n.changeText("player-info-phone-input", "914000000");
    expect(bea.n.byTestId("player-info-save").props.disabled).toBeFalsy();
    expect(bea.n.queryByTestId("player-level-select")).toBeNull();

    // With levels, a plain Editar saves a note with Nível untouched and empty.
    const plain = await mount(tiago, "edit");
    await plain.n.changeText("player-notes", "Forehand first");
    expect(plain.n.byTestId("player-info-save").props.disabled).toBeFalsy();
    await plain.n.press("player-info-save");
    expect(plain.onSave).toHaveBeenCalledWith({ notes: "Forehand first" });

    // "Completar informação" waits for the level.
    const complete = await mount(tiago, "complete");
    await complete.n.changeText("player-info-phone-input", "915000000");
    expect(complete.n.byTestId("player-info-save").props.disabled).toBe(true);
    await complete.n.press("option-L1");
    expect(complete.n.byTestId("player-info-save").props.disabled).toBeFalsy();
  });

  it("shows 'Por definir' for a missing level or side in read mode", async () => {
    const { n } = await mount({ ...tiago, side: undefined } as CoachPlayer, null);
    expect(n.queryByTestId("player-info-level-unset")).not.toBeNull();
    expect(n.queryByTestId("player-info-side-unset")).not.toBeNull();
  });
});
