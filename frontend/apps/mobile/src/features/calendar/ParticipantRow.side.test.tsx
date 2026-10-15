/**
 * PAD-551 (iOS) — classes.instance-enrollment rule 13: the coach sets a player's side for this
 * occurrence from the participant row; a row whose side is set here says so. The twin of web's
 * AttendanceRow.side.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { Player } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { ParticipantRow } from "./ParticipantRow";

const player = { id: 7, user: { name: "Ana Lopes" } } as unknown as Player;

async function row(side?: Partial<NonNullable<Parameters<typeof ParticipantRow>[0]["side"]>>) {
  const onChange = vi.fn();
  const n = await renderNative(
    createElement(ParticipantRow, {
      player,
      attendance: { status: null },
      canMark: false,
      side: side ? { current: "left", override: false, editable: true, onChange, ...side } : undefined,
    })
  );
  return { n, onChange };
}

describe("ParticipantRow — side in this occurrence (PAD-551)", () => {
  it("has no side control without side props", async () => {
    const { n } = await row();
    expect(n.queryByTestId("participant-side-usual-7")).toBeNull();
  });

  it("starts on the usual side and sets the other one for this class", async () => {
    const { n, onChange } = await row({ current: "left", override: false });
    expect(n.byTestId("participant-side-usual-7").props.accessibilityState).toMatchObject({ selected: true });
    expect(n.queryByTestId("participant-side-7")).toBeNull();
    await n.press("participant-side-right-7");
    expect(onChange).toHaveBeenCalledWith("right");
  });

  it("marks an override and clears it back to the usual side", async () => {
    const { n, onChange } = await row({ current: "right", override: true });
    expect(n.byTestId("participant-side-right-7").props.accessibilityState).toMatchObject({ selected: true });
    expect(n.byTestId("participant-side-7")).toBeTruthy();
    await n.press("participant-side-usual-7");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the tag but no control once the server says it is not editable", async () => {
    const { n } = await row({ current: "right", override: true, editable: false });
    expect(n.byTestId("participant-side-7")).toBeTruthy();
    expect(n.queryByTestId("participant-side-usual-7")).toBeNull();
  });
});
