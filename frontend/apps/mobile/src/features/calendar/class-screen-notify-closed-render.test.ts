import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ClassNotifyAction, notifyState, shouldAutoOpenNotify } from "./notify-new-engine";

/** PAD-798 (notifications.manual rule 10): once the class has started, Notificar gives way to the
 * warning "invitations are closed", same test ids as web, and the dashboard's `notify=1` no longer
 * opens the picker. "Started" is `hasClassStarted` (club clock), pinned in attendance-decline.test.
 * The screen's wiring is source-read (app/class/[id].tsx mounts react-query hooks, and a test file
 * under app/ would break Metro); the decision and the button live in notify-new-engine.tsx (PAD-933),
 * which renders here. */
const SCREEN = readFileSync(resolve(__dirname, "../../..", "app/class/[id].tsx"), "utf8");

describe("Notificar on a class that has started (PAD-798)", () => {
  it("decides it with the shared club-clock check on the class's own date and start", () => {
    expect(SCREEN).toMatch(
      /notifyState\(\s*active\?\.engineVersion \?\? event\?\.engineVersion,\s*hasClassStarted\(active\?\.date \?\? event\?\.date, active\?\.startTime \?\? event\?\.startTime\)\s*\)/,
    );
    expect(notifyState("old", true)).toBe("started");
  });

  it("the warning stands where Notificar was", async () => {
    expect(SCREEN).toMatch(/<ClassNotifyAction state=\{notify\} onOpen=\{\(\) => setShowNotify\(true\)\} \/>/);
    const r = await renderNative(createElement(ClassNotifyAction, { state: "started", onOpen: () => undefined }));
    expect(r.byTestId("class-notify-closed").props.children).toBe("calendar.notify.classStarted");
    expect(r.queryByTestId("class-notify")).toBeNull();
  });

  it("notify=1 does not open the picker once the class has started", () => {
    expect(SCREEN).toMatch(/shouldAutoOpenNotify\(notifyParam, isCoach && !isPending, notify, autoNotifiedRef\.current\)/);
    expect(shouldAutoOpenNotify("1", true, notifyState("old", true), false)).toBe(false);
    expect(shouldAutoOpenNotify("1", true, notifyState("old", false), false)).toBe(true);
  });
});
