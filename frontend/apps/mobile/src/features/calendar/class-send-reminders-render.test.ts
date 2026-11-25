import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import i18next from "i18next";
import { describe, expect, it, vi } from "vitest";
import calendarEn from "../../../../../src/locales/en/calendar.json";
import calendarPt from "../../../../../src/locales/pt/calendar.json";
import { NOT_ASKED_KEYS, reportReminders, type ReminderToasts } from "./send-reminders-report";

/** Engine plan item #16 (notifications.class-reminders-manual rule 7): after "send reminders" the class
 * screen names every student the send did not ask under their cause's words, as web's ClassDetailSheet
 * does, and never says "reminders sent to 0". The screen's wiring is source-read (app/class/[id].tsx
 * mounts react-query hooks, and a test file under app/ would break Metro); the report lives in
 * send-reminders-report.ts and runs here with the locale files lib/i18n.ts statically imports (its
 * module needs Expo's runtime, so the test builds the same resources itself). */
const SCREEN = readFileSync(resolve(__dirname, "../../..", "app/class/[id].tsx"), "utf8");
const I18N = readFileSync(resolve(__dirname, "../..", "lib/i18n.ts"), "utf8");
const i18n = i18next.createInstance();
void i18n.init({
  resources: { en: { translation: calendarEn }, pt: { translation: calendarPt } },
  lng: "pt",
  interpolation: { escapeValue: false },
});

function fakeToasts() {
  const shown: { kind: keyof ReminderToasts; title: string }[] = [];
  const toasts: ReminderToasts = {
    success: vi.fn((title: string) => void shown.push({ kind: "success", title })),
    warning: vi.fn((title: string) => void shown.push({ kind: "warning", title })),
    error: vi.fn((title: string) => void shown.push({ kind: "error", title })),
  };
  return { shown, toasts };
}

const answer = {
  sent: 0,
  blocked: [
    { playerId: 4, name: "Duarte", cause: "already_confirmed" },
    { playerId: 5, name: "Eva", cause: "not_coming" },
    { playerId: 6, name: "Filipe", cause: "reminder_limit" },
  ],
};

describe("send reminders names the students not asked (engine #16)", () => {
  it("[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-7] names the students not asked under each cause", () => {
    expect(SCREEN).toMatch(/reportReminders\(\{ sent, blocked \}, t, toast, displayName\)/);
    // The mobile i18n trap: the screen reads these keys only if lib/i18n.ts imports calendar.json.
    expect(I18N).toContain('from "../../../../src/locales/en/calendar.json"');
    expect(I18N).toContain('from "../../../../src/locales/pt/calendar.json"');
    for (const lng of ["pt", "en"]) {
      const t = i18n.getFixedT(lng);
      const { shown, toasts } = fakeToasts();
      reportReminders(answer, (key, options) => t(key, options), toasts);
      expect(shown.map((s) => s.title)).toEqual([
        t(NOT_ASKED_KEYS.alreadyConfirmed, { names: "Duarte" }),
        t(NOT_ASKED_KEYS.notComing, { names: "Eva" }),
        t(NOT_ASKED_KEYS.reminderLimit, { names: "Filipe" }),
      ]);
      // The words are the locale's (a key missing from lib/i18n.ts's static imports reads back raw).
      for (const s of shown) expect(s.title).not.toMatch(/calendar\.notify\./);
      expect(shown.map((s) => s.title)).toEqual(
        expect.arrayContaining([expect.stringContaining("Duarte"), expect.stringContaining("Eva"), expect.stringContaining("Filipe")])
      );
      expect(toasts.success).not.toHaveBeenCalled();
      expect(toasts.error).not.toHaveBeenCalled();
    }
  });

  it("names a student by the coach's display name when the screen passes one", () => {
    const { shown, toasts } = fakeToasts();
    reportReminders({ sent: 1, blocked: [{ playerId: 5, name: "Eva", cause: "not_coming" }] }, (k, o) => `${k}:${String(o?.names ?? o?.count)}`, toasts, () => "Evinha");
    expect(shown).toEqual([
      { kind: "warning", title: `${NOT_ASKED_KEYS.notComing}:Evinha` },
      { kind: "success", title: "calendar.detail.remindersSent:1" },
    ]);
  });
});
