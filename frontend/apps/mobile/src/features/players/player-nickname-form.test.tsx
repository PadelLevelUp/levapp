import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

/** PAD-660 (players.nickname rule 6): the edit form carries the nickname field, its warning and the
 * "use as main name" switch; the create form does not. `name` keeps editing the real name. */
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("@levelup/hooks", () => ({ useFieldAvailability: () => ({ checking: false, error: null, conflict: null }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/switch", async () => {
  const { Switch } = await import("react-native");
  return { Switch };
});

import { PlayerForm } from "./PlayerForm";

async function mount(showNickname: boolean, initialValues: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const n = await renderNative(
    createElement(PlayerForm, {
      levels: [],
      submitLabel: "save",
      onSubmit,
      showNickname,
      initialValues: { name: "Jorge Silva", ...initialValues },
    })
  );
  return { n, onSubmit };
}

describe("PlayerForm — nickname (PAD-660)", () => {
  it("shows the field, the warning and the switch in edit mode", async () => {
    const { n } = await mount(true, { nickname: "Jorge chato", nicknameAsName: true });
    expect(n.byTestId("player-nickname").props.value).toBe("Jorge chato");
    expect(n.byTestId("player-nickname").props.maxLength).toBe(60);
    expect(n.queryByTestId("player-nickname-warning")).not.toBeNull();
    expect(n.byTestId("player-nickname-as-name").props["aria-checked"]).toBe(true);
  });

  it("shows none of them in create mode", async () => {
    const { n } = await mount(false);
    expect(n.queryByTestId("player-nickname")).toBeNull();
    expect(n.queryByTestId("player-nickname-warning")).toBeNull();
    expect(n.queryByTestId("player-nickname-as-name")).toBeNull();
  });

  it("submits the nickname and the switch beside the unchanged real name", async () => {
    const { n, onSubmit } = await mount(true);
    await n.changeText("player-nickname", "  Jorge chato ");
    await n.toggle("player-nickname-as-name");
    await n.press("player-save");
    const sent = onSubmit.mock.calls[0][0];
    expect(sent.name).toBe("Jorge Silva");
    expect(sent.nickname).toBe("Jorge chato");
    expect(sent.nicknameAsName).toBe(true);
  });

  it("refuses over 60 characters with the too-long text", async () => {
    const { n, onSubmit } = await mount(true);
    await n.changeText("player-nickname", "x".repeat(61));
    await n.press("player-save");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(n.queryByTestId("player-nickname-too-long")).not.toBeNull();
  });
});
