/**
 * PAD-313 (`calendar.event-detail` rule 3a as amended, `attendance.confirm`
 * rule 25): a participant row shows exactly ONE state word.
 *
 * Before this ticket the same row could render three at once — a "Confirmed
 * attendance" chip off `Presence.confirmed`, a "Justified" badge off
 * `status`+`justification`, and the class-detail block's own "not attending"
 * wording. `confirmed` means *answered*, and the decline path sets it true, so a
 * student who had cancelled read as confirmed. These tests pin the replacement.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Player } from "@/types";
import { AttendanceRow } from "./AttendanceRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts.when === "string" ? `${key}:${opts.when}` : key,
    i18n: { language: "pt" },
  }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const player = { id: "7", user: { name: "Ana Lopes" } } as unknown as Player;

function row(presence: Record<string, unknown>, audience: "student" | "coach" = "coach") {
  render(
    <AttendanceRow
      player={player}
      attendance={{
        status: (presence.status as "present" | "absent" | null) ?? null,
        justification: presence.justification as "justified" | "unjustified" | undefined,
      }}
      onChange={() => {}}
      disabled
      presence={presence}
      audience={audience}
    />
  );
  return screen.getByTestId("attendance-state");
}

const CANCELLED = {
  attendanceState: "not_coming",
  confirmed: true,
  status: "absent",
  justification: "justified",
  validated: false,
  cancelledByStudent: true,
  cancelledAt: "2026-09-20T09:30:00+00:00",
};

describe("one state word per row", () => {
  it("renders the state from attendanceState, not from the raw columns", () => {
    const badge = row(CANCELLED);
    expect(badge).toHaveAttribute("data-state", "not_coming");
    expect(badge).toHaveTextContent("calendar.attendanceState.not_coming.coach");
  });

  it("renders exactly one state element, whatever the columns say", () => {
    row(CANCELLED);
    expect(screen.getAllByTestId("attendance-state")).toHaveLength(1);
  });

  it("no longer renders the confirmed/reminder chip that claimed a cancellation was confirmed", () => {
    row(CANCELLED);
    expect(screen.queryByTestId("attendance-signal")).toBeNull();
  });

  it("speaks about the student to the coach", () => {
    expect(row({ attendanceState: "coming" }, "coach")).toHaveTextContent(
      "calendar.attendanceState.coming.coach"
    );
  });

  it("speaks to the student about themselves on their own row", () => {
    expect(row({ attendanceState: "coming" }, "student")).toHaveTextContent(
      "calendar.attendanceState.coming.student"
    );
  });

  it("reports the coach's record once validated", () => {
    const badge = row({
      attendanceState: "missed",
      status: "absent",
      justification: "justified",
      validated: true,
    });
    expect(badge).toHaveAttribute("data-state", "missed");
  });
});

describe("the cancellation line is provenance, not a second state", () => {
  it("shows who cancelled and when, as secondary text on the coach's row", () => {
    row(CANCELLED);
    const detail = screen.getByTestId("attendance-cancelled-by-student");
    expect(detail).toHaveTextContent("calendar.detail.cancelledByStudentAt");
    // Lesser weight than the state word, never a chip (coordinator, 2026-09-12).
    expect(detail.className).toMatch(/text-muted-foreground/);
  });

  it("is absent on the student's own row", () => {
    row(CANCELLED, "student");
    expect(screen.queryByTestId("attendance-cancelled-by-student")).toBeNull();
  });

  it("is absent once the coach has validated", () => {
    row({ ...CANCELLED, attendanceState: "missed", validated: true });
    expect(screen.queryByTestId("attendance-cancelled-by-student")).toBeNull();
  });
});

describe("B-017's reminder signal, demoted and conditional", () => {
  it("shows while the row is planned and a reminder went out", () => {
    row({ attendanceState: "planned", reminderSentAt: "2026-09-18T08:00:00+00:00" });
    expect(screen.getByTestId("attendance-reminder-hint")).toHaveTextContent(
      "calendar.attendanceState.reminderSent"
    );
  });

  it("is silent on planned with no reminder", () => {
    row({ attendanceState: "planned" });
    expect(screen.queryByTestId("attendance-reminder-hint")).toBeNull();
  });

  it("is silent once the student has answered, reminder or not", () => {
    row({ attendanceState: "coming", reminderSentAt: "2026-09-18T08:00:00+00:00" });
    expect(screen.queryByTestId("attendance-reminder-hint")).toBeNull();
  });
});
