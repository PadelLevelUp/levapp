/** players.nickname rule 8 (PAD-660): the attendance inbox prints the coach's name for each student. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import type { PendingValidationClass } from "@/types";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "11" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import { ValidateClassesDialog } from "./ValidateClassesDialog";
const Dialog = ValidateClassesDialog as unknown as ComponentType<Record<string, unknown>>;

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const player = (id: number, name: string) => ({
  presenceId: id, playerId: id, name, response: "confirmed", status: null, justification: null,
  validated: false, lateCancellation: false, guest: false,
});
const KLASS = {
  lessonInstanceId: 1, calendarEventId: "lessoninstance-1", title: "First", type: "academy", color: null,
  startDatetime: "2026-09-01T11:00:00", date: "2026-09-01", unanswered: 0, ready: true,
  players: [player(11, "Jorge Silva"), player(12, "Ana Pinto")],
} as PendingValidationClass;

describe("ValidateClassesDialog names", () => {
  it("print the nickname for one student and the real name for another", () => {
    render(<Dialog pending={[KLASS]} validated={[]} pendingCount={1} weekOffset={0} onWeekChange={() => {}}
      roster={[]} onValidate={async () => {}} onUnvalidate={async () => {}} busyClassIds={[]} />);
    fireEvent.click(screen.getByTestId("presences-validate-trigger"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Jorge chato");
    expect(text).not.toContain("Jorge Silva");
    expect(text).toContain("Ana Pinto");
  });
});
