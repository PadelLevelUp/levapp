/**
 * PAD-664 (calendar.view rule 23): the student's filter control and its per-user, per-device
 * memory. Storage may be missing or throw — the filter still works for the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { studentFilterStorageKey } from "@levelup/config";
import { StudentCalendarFilter, useStudentCalendarFilter } from "./StudentCalendarFilter";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useStudentCalendarFilter", () => {
  it("defaults to eligible and persists the choice under the user's key", () => {
    const { result } = renderHook(() => useStudentCalendarFilter(7));
    expect(result.current[0]).toBe("eligible");
    act(() => result.current[1]("mine"));
    expect(result.current[0]).toBe("mine");
    expect(window.localStorage.getItem(studentFilterStorageKey(7))).toBe("mine");
    expect(renderHook(() => useStudentCalendarFilter(7)).result.current[0]).toBe("mine");
    expect(renderHook(() => useStudentCalendarFilter(8)).result.current[0]).toBe("eligible");
  });

  it("an unknown stored value falls back to the default", () => {
    window.localStorage.setItem(studentFilterStorageKey(7), "junk");
    expect(renderHook(() => useStudentCalendarFilter(7)).result.current[0]).toBe("eligible");
  });

  it("works with storage throwing on read and write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useStudentCalendarFilter(7));
    expect(result.current[0]).toBe("eligible");
    act(() => result.current[1]("mine"));
    expect(result.current[0]).toBe("mine");
  });
});

describe("StudentCalendarFilter", () => {
  it("two buttons, the active one pressed; clicking reports the choice", () => {
    const onChange = vi.fn();
    render(<StudentCalendarFilter value="eligible" onChange={onChange} />);
    expect(screen.getByTestId("calendar-student-filter-eligible").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("calendar-student-filter-mine").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("calendar-student-filter-mine"));
    expect(onChange).toHaveBeenCalledWith("mine");
  });
});
