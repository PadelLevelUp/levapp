/**
 * PAD-934 (calendar.view rule 23), the phone's half: "Sair da lista de espera" in the class screen's
 * waiting-list block. One confirm, the existing leave endpoint, `onLeft` after it; a 404 is no error.
 * Located by test id; `t` returns the key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
const leaveClassWaitingList = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/academyClasses", () => ({ leaveClassWaitingList }));

import { WaitingListLeave } from "./waiting-list-leave";

beforeEach(() => {
  leaveClassWaitingList.mockReset().mockResolvedValue({});
  toast.error.mockClear();
});

describe("leaving the waiting list from the class screen (PAD-934)", () => {
  it("[CALENDAR-VIEW-27] a student on the waiting list leaves it from the class detail", async () => {
    const onLeft = vi.fn();
    const ui = await renderNative(<WaitingListLeave lessonInstanceId={7} onLeft={onLeft} />);
    // Asked once: no changes nothing.
    await ui.press("class-waiting-list-leave");
    await ui.press("class-waiting-list-leave-no");
    expect(leaveClassWaitingList).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
    // Yes: the existing endpoint with the instance id, then the screen is told.
    await ui.press("class-waiting-list-leave");
    await ui.press("class-waiting-list-leave-yes");
    await ui.flush();
    expect(leaveClassWaitingList).toHaveBeenCalledTimes(1);
    expect(leaveClassWaitingList).toHaveBeenCalledWith(7);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("[CALENDAR-VIEW-27] a 404 is no error; any other failure keeps the block and says so", async () => {
    const onLeft = vi.fn();
    leaveClassWaitingList.mockRejectedValueOnce({ response: { status: 404 } });
    const gone = await renderNative(<WaitingListLeave lessonInstanceId={7} onLeft={onLeft} />);
    await gone.press("class-waiting-list-leave");
    await gone.press("class-waiting-list-leave-yes");
    await gone.flush();
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();

    leaveClassWaitingList.mockRejectedValueOnce({ response: { status: 500 } });
    const failed = await renderNative(<WaitingListLeave lessonInstanceId={7} onLeft={onLeft} />);
    await failed.press("class-waiting-list-leave");
    await failed.press("class-waiting-list-leave-yes");
    await failed.flush();
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("classRequests.waitingList.leaveFailed");
  });
});
