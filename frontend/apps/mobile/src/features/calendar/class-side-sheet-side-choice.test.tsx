/**
 * PAD-920 (notifications.config rule 20, "The student's side choice"), the iOS half: with the coach's
 * `waitingListSideChoice` on, a waiting-list join on a new-engine class offers "my side / the other
 * side / both" and the join sends `sides`; with the setting off, an old-engine class, or a join
 * request, the sheet is today's absolute choice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const joinClassWaitingList = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/academyClasses", () => ({ joinClassWaitingList }));
vi.mock("@levelup/api/src/resources/classJoinRequests", () => ({ createClassJoinRequest: vi.fn() }));

import { ClassSideSheet } from "./ClassSideSheet";

const base = { model: "LessonInstance", originalId: 5, date: "2026-11-20" };
const RELATIVE = ["waiting-list-side-own", "waiting-list-side-other", "waiting-list-side-both"];
const ABSOLUTE = ["class-side-left", "class-side-right", "class-side-both"];

beforeEach(() => {
  joinClassWaitingList.mockReset().mockResolvedValue({});
});

describe("ClassSideSheet: the students' own/other/both choice", () => {
  it("[NOTIFICATIONS-CONFIG-73] offers own, other or both only when the coach turned it on", async () => {
    const onJoined = vi.fn();
    const on = await renderNative(
      <ClassSideSheet
        open
        onClose={() => {}}
        mode="waiting"
        event={{ ...base, engineVersion: "new", waitingListSideChoice: true }}
        profileSide="left"
        onWaitingListJoined={onJoined}
      />
    );
    for (const id of RELATIVE) expect(on.queryByTestId(id)).not.toBeNull();
    for (const id of ABSOLUTE) expect(on.queryByTestId(id)).toBeNull();
    // Nothing is pre-chosen: send waits for a pick.
    expect(on.byTestId("class-side-send").props.disabled).toBe(true);
    await on.press("waiting-list-side-other");
    await on.press("class-side-send");
    await on.flush();
    expect(joinClassWaitingList).toHaveBeenCalledWith(expect.objectContaining({ originalId: 5 }), undefined, "other");
    expect(onJoined).toHaveBeenCalledWith("right");

    // The setting off, an old-engine class, or a join request: today's absolute sides.
    const cases = [
      { mode: "waiting" as const, event: { ...base, engineVersion: "new" as const, waitingListSideChoice: false } },
      { mode: "waiting" as const, event: { ...base, engineVersion: "old" as const, waitingListSideChoice: true } },
      { mode: "waiting" as const, event: base },
      { mode: "request" as const, event: { ...base, engineVersion: "new" as const, waitingListSideChoice: true } },
    ];
    for (const c of cases) {
      const off = await renderNative(
        <ClassSideSheet open onClose={() => {}} mode={c.mode} event={c.event} profileSide="left" />
      );
      for (const id of ABSOLUTE) expect(off.queryByTestId(id)).not.toBeNull();
      for (const id of RELATIVE) expect(off.queryByTestId(id)).toBeNull();
    }

    // Off, the waiting-list join sends the absolute side and no `sides`, as today.
    joinClassWaitingList.mockClear();
    const today = await renderNative(
      <ClassSideSheet open onClose={() => {}} mode="waiting" event={base} profileSide="left" />
    );
    await today.press("class-side-send");
    await today.flush();
    expect(joinClassWaitingList).toHaveBeenCalledWith(base, "left");
  });
});
