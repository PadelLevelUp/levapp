/**
 * PAD-929 (classes.join-requests rule 22), the phone's half: a private lesson asks the warning BEFORE
 * the side sheet. NÃO closes with nothing sent; SIM opens the sheet and the join carries
 * `privateConfirmed: true`; a `private_unconfirmed` answer asks again after the caller re-reads the
 * class. Located by test id; `t` returns the key.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children);
  const button = (p: { children?: React.ReactNode; testID?: string; onPress?: () => void }) =>
    React.createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children);
  return {
    AlertDialog: (p: { open: boolean; children?: React.ReactNode }) => (p.open ? React.createElement(View, null, p.children) : null),
    AlertDialogContent: box,
    AlertDialogHeader: box,
    AlertDialogFooter: box,
    AlertDialogDescription: box,
    AlertDialogCancel: button,
    AlertDialogAction: button,
  };
});

const joinClassWaitingList = vi.hoisted(() => vi.fn());
const createClassJoinRequest = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/academyClasses", () => ({ joinClassWaitingList }));
vi.mock("@levelup/api/src/resources/classJoinRequests", () => ({ createClassJoinRequest }));

import { ClassSideSheet } from "./ClassSideSheet";

const EVENT = { model: "LessonInstance", originalId: 5, date: "2026-11-20" };
const unconfirmed = { response: { status: 409, data: { code: "private_unconfirmed", message: "x" } } };

beforeEach(() => {
  createClassJoinRequest.mockReset().mockResolvedValue({ id: 1, status: "pending", side: "left" });
  joinClassWaitingList.mockReset().mockResolvedValue({});
});

function sheet(extra: Record<string, unknown> = {}) {
  const props = {
    onClose: vi.fn(),
    onRequestSent: vi.fn(),
    onWaitingListJoined: vi.fn(),
    onFailed: vi.fn(),
    onPrivateUnconfirmed: vi.fn(),
    ...extra,
  };
  return {
    props,
    element: <ClassSideSheet open mode="request" event={EVENT} profileSide="left" privateWarning {...props} {...extra} />,
  };
}

describe("the private-lesson warning precedes any join", () => {
  it("[CLASSES-JOIN-REQUESTS-43] the private-lesson warning precedes any join", async () => {
    const { props, element } = sheet();
    const ui = await renderNative(element);
    // Asked first: the side sheet's Modal is not visible yet (the stub renders a hidden Modal's children).
    const modalVisible = () => ui.root.root.findByType("Modal" as never).props.visible;
    expect(ui.queryByTestId("private-lesson-warning")).not.toBeNull();
    expect(modalVisible()).toBe(false);
    // NÃO: closes, nothing sent.
    await ui.press("private-lesson-warning-no");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(createClassJoinRequest).not.toHaveBeenCalled();
    expect(joinClassWaitingList).not.toHaveBeenCalled();

    // SIM: the side sheet opens, and the request carries the confirmation.
    const again = await renderNative(sheet({ note: "hi" }).element);
    await again.press("private-lesson-warning-yes");
    expect(again.queryByTestId("private-lesson-warning")).toBeNull();
    expect(again.root.root.findByType("Modal" as never).props.visible).toBe(true);
    expect(createClassJoinRequest).not.toHaveBeenCalled();
    await again.press("class-side-send");
    await again.flush();
    expect(createClassJoinRequest).toHaveBeenCalledWith(EVENT, "hi", "left", true);
  });

  it("[CLASSES-JOIN-REQUESTS-43] the waiting-list join carries privateConfirmed: true after SIM", async () => {
    const ui = await renderNative(sheet({ mode: "waiting" }).element);
    await ui.press("private-lesson-warning-yes");
    await ui.press("class-side-send");
    await ui.flush();
    expect(joinClassWaitingList).toHaveBeenCalledWith(EVENT, "left", undefined, true);
  });

  it("[CLASSES-JOIN-REQUESTS-43] an academy class shows no warning and sends no privateConfirmed", async () => {
    const ui = await renderNative(sheet({ privateWarning: false }).element);
    expect(ui.queryByTestId("private-lesson-warning")).toBeNull();
    await ui.press("class-side-send");
    await ui.flush();
    expect(createClassJoinRequest).toHaveBeenCalledWith(EVENT, undefined, "left");
  });

  it("[CLASSES-JOIN-REQUESTS-43] a private_unconfirmed answer reads the class again and opens the warning", async () => {
    createClassJoinRequest.mockRejectedValueOnce(unconfirmed);
    const { props, element } = sheet({ privateWarning: false });
    const ui = await renderNative(element);
    await ui.press("class-side-send");
    await ui.flush();
    expect(ui.queryByTestId("private-lesson-warning")).not.toBeNull();
    expect(props.onPrivateUnconfirmed).toHaveBeenCalledTimes(1);
    expect(props.onFailed).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    await ui.press("private-lesson-warning-yes");
    await ui.press("class-side-send");
    await ui.flush();
    expect(createClassJoinRequest).toHaveBeenLastCalledWith(EVENT, undefined, "left", true);
  });
});
