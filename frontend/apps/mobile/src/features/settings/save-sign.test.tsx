/**
 * settings.save-on-change rules 2-3 (PAD-473) — the iOS twin of web's SaveSign. The sign is
 * announced to VoiceOver (AccessibilityInfo, captured by the react-native mock).
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __announcements, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { SAVE_SIGN_PAUSE_MS, SAVE_SIGN_VISIBLE_MS, SaveSign, useSaveSign } from "./save-sign";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

type Api = ReturnType<typeof useSaveSign>;
function Harness({ onApi }: { onApi: (api: Api) => void }) {
  const api = useSaveSign();
  onApi(api);
  return <SaveSign status={api.status("scale")} testID="sign" />;
}

let api!: Api;
const mount = () => renderNative(<Harness onApi={(a) => { api = a; }} />);
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const text = (n: Awaited<ReturnType<typeof renderNative>>) =>
  n.byTestId("sign").findAll((x) => typeof x.props.children === "string").map((x) => x.props.children).join("");

beforeEach(() => { vi.useFakeTimers(); __resetReactNativeMock(); });
afterEach(() => vi.useRealTimers());

describe("useSaveSign on iOS (rules 2-3)", () => {
  it("shows saved after the confirmed save and a pause, announces it once, then clears", async () => {
    const n = await mount();
    const save = deferred();
    await act(async () => { void api.track("scale", save.promise); });
    await act(async () => { save.resolve(); });
    expect(api.status("scale")).toBe("idle");
    expect(text(n)).toBe("");

    await advance(SAVE_SIGN_PAUSE_MS);
    expect(api.status("scale")).toBe("saved");
    expect(text(n)).toContain("settings.saveSign.saved");
    expect(__announcements()).toEqual(["settings.saveSign.saved"]);

    await advance(SAVE_SIGN_VISIBLE_MS);
    expect(api.status("scale")).toBe("idle");
    expect(__announcements()).toHaveLength(1);
  });

  it("three quick saves give one sign and one announcement", async () => {
    await mount();
    for (let i = 0; i < 3; i++) {
      const save = deferred();
      await act(async () => { void api.track("scale", save.promise); });
      await act(async () => { save.resolve(); });
      await advance(150);
      expect(api.status("scale")).toBe("idle");
    }
    await advance(SAVE_SIGN_PAUSE_MS);
    expect(api.status("scale")).toBe("saved");
    expect(__announcements()).toEqual(["settings.saveSign.saved"]);
  });

  it("a failure shows and is announced at once, and stays until the next change", async () => {
    const n = await mount();
    const save = deferred();
    await act(async () => { void api.track("scale", save.promise); });
    await act(async () => { save.reject(new Error("offline")); });

    expect(api.status("scale")).toBe("failed");
    expect(text(n)).toContain("settings.saveSign.failed");
    expect(__announcements()).toEqual(["settings.saveSign.failed"]);
    await advance(SAVE_SIGN_VISIBLE_MS * 3);
    expect(api.status("scale")).toBe("failed");
  });

  it("an older save failing after a newer one was confirmed does not claim a failure", async () => {
    await mount();
    const older = deferred();
    const newer = deferred();
    await act(async () => { void api.track("scale", older.promise); });
    await act(async () => { void api.track("scale", newer.promise); });
    await act(async () => { newer.resolve(); });
    await act(async () => { older.reject(new Error("late")); });
    await advance(SAVE_SIGN_PAUSE_MS);

    expect(api.status("scale")).toBe("saved");
    expect(__announcements()).toEqual(["settings.saveSign.saved"]);
  });

  it("idle renders the sign's container with no text", async () => {
    const n = await mount();
    expect(text(n)).toBe("");
  });
});
