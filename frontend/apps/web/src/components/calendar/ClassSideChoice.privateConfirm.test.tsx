/**
 * PAD-929 (classes.join-requests rule 22): a private lesson asks the warning BEFORE the side choice.
 * NÃO closes with nothing sent; SIM opens the side choice and the join carries `privateConfirmed:
 * true`; a `private_unconfirmed` answer asks again after the caller re-reads the class. Located by
 * test id (R-013); `t` returns the key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  createClassJoinRequest: vi.fn(),
  joinClassWaitingList: vi.fn(),
}));
vi.mock("@/api/classJoinRequests", () => ({ createClassJoinRequest: api.createClassJoinRequest }));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: api.joinClassWaitingList }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ClassSideChoice, type ClassSideChoiceProps } from "./ClassSideChoice";
import { needsPrivateLessonWarning } from "@levelup/config";

const EVENT = { model: "ClassInstance", originalId: 7, date: "2099-10-19" };
const unconfirmed = { response: { status: 409, data: { code: "private_unconfirmed", message: "x" } } };

function renderSheet(extra: Partial<ClassSideChoiceProps> = {}) {
  const props: ClassSideChoiceProps = {
    open: true,
    onOpenChange: vi.fn(),
    mode: "request",
    event: EVENT,
    profileSide: "left",
    privateWarning: true,
    onRequestSent: vi.fn(),
    onWaitingListJoined: vi.fn(),
    onFailed: vi.fn(),
    onPrivateUnconfirmed: vi.fn(),
    ...extra,
  };
  render(<ClassSideChoice {...props} />);
  return props;
}

beforeEach(() => {
  api.createClassJoinRequest.mockReset().mockResolvedValue({ id: 1, status: "pending", side: "left" });
  api.joinClassWaitingList.mockReset().mockResolvedValue({ lessonInstanceId: 7, onWaitingList: true, side: "left" });
});

describe("the private-lesson warning precedes any join", () => {
  it("[CLASSES-JOIN-REQUESTS-43] the private-lesson warning precedes any join", async () => {
    // NÃO: the question closes, nothing is sent.
    const no = renderSheet();
    expect(screen.getByTestId("private-lesson-warning")).toBeTruthy();
    expect(screen.queryByTestId("class-side-choice")).toBeNull();
    fireEvent.click(screen.getByTestId("private-lesson-warning-no"));
    expect(no.onOpenChange).toHaveBeenCalledWith(false);
    expect(api.createClassJoinRequest).not.toHaveBeenCalled();
    expect(api.joinClassWaitingList).not.toHaveBeenCalled();
  });

  it("[CLASSES-JOIN-REQUESTS-43] SIM opens the side choice and the request carries privateConfirmed: true", async () => {
    const props = renderSheet({ note: "hi" });
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    expect(await screen.findByTestId("class-side-choice")).toBeTruthy();
    // SIM is an answer, not a dismissal: the sheet is not asked to close.
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(api.createClassJoinRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenCalledWith(EVENT, "hi", "left", true));
  });

  it("[CLASSES-JOIN-REQUESTS-43] the waiting-list join carries privateConfirmed: true after SIM", async () => {
    renderSheet({ mode: "waiting" });
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    fireEvent.click(await screen.findByTestId("class-side-send"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(EVENT, "left", undefined, true));
  });

  it("[CLASSES-JOIN-REQUESTS-43] an academy class shows no warning and sends no privateConfirmed", async () => {
    renderSheet({ privateWarning: false });
    expect(screen.queryByTestId("private-lesson-warning")).toBeNull();
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenCalledWith(EVENT, undefined, "left"));
  });

  it("[CLASSES-JOIN-REQUESTS-43] a private_unconfirmed answer reads the class again and opens the warning", async () => {
    api.createClassJoinRequest.mockRejectedValueOnce(unconfirmed);
    // A class this client did not know was private: no warning first, the server asks.
    const props = renderSheet({ privateWarning: false });
    fireEvent.click(screen.getByTestId("class-side-send"));
    expect(await screen.findByTestId("private-lesson-warning")).toBeTruthy();
    expect(props.onPrivateUnconfirmed).toHaveBeenCalledTimes(1);
    expect(props.onFailed).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    fireEvent.click(await screen.findByTestId("class-side-send"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenLastCalledWith(EVENT, undefined, "left", true));
  });

  it("[CLASSES-JOIN-REQUESTS-43] who is asked: private requests and waiting-list joins, not an invitee's or a come-back", () => {
    expect(needsPrivateLessonWarning({ classType: "private" }, "request")).toBe(true);
    expect(needsPrivateLessonWarning({ classType: "private", studentRelation: "full" }, "waitlist")).toBe(true);
    expect(needsPrivateLessonWarning({ classType: "private", studentRelation: "not_coming" }, "waitlist")).toBe(false);
    expect(needsPrivateLessonWarning({ classType: "academy" }, "request")).toBe(false);
  });
});
