import { describe, it, expect } from "vitest";
import { enUS, pt } from "date-fns/locale";
import { resolveDateLocale, formatWeekRangeLabel } from "./dateLocale";

// PAD-181 (spec: calendar.view rule 12, settings.language rule 4).
//
// The language -> date-fns Locale mapping used to live in
// apps/web/src/lib/dateLocale.ts, so packages/hooks' useCalendar could not
// reach it and hardcoded enGB — a Portuguese coach saw "31 Aug–6 Sep" on web
// AND on iOS. The resolver now lives here, platform-neutral, and the week-range
// label is a pure function of (weekStart, locale) so both shells and the hook
// produce the same string.

describe("resolveDateLocale", () => {
  it("maps 'pt' to the Portuguese locale", () => {
    expect(resolveDateLocale("pt")).toBe(pt);
  });

  it("maps 'en' to the English (US) locale", () => {
    expect(resolveDateLocale("en")).toBe(enUS);
  });

  it("uses only the primary subtag of a region-tagged code", () => {
    expect(resolveDateLocale("en-GB")).toBe(enUS);
    expect(resolveDateLocale("pt-PT")).toBe(pt);
  });

  it("falls back to Portuguese for unknown or missing languages", () => {
    // settings.language rule 4: the app-wide fallback locale is pt (PAD-39).
    expect(resolveDateLocale("fr")).toBe(pt);
    expect(resolveDateLocale(undefined)).toBe(pt);
    expect(resolveDateLocale("")).toBe(pt);
  });
});

describe("formatWeekRangeLabel", () => {
  // Monday 31 August 2026 -> Sunday 6 September 2026 (the cross-month week the
  // ticket screenshots): month abbreviation on BOTH ends.
  const crossMonthWeekStart = new Date(2026, 7, 31);
  // Monday 6 July 2026 -> Sunday 12 July 2026: same month, so only the end
  // carries the abbreviation (kept short for a 375px header).
  const sameMonthWeekStart = new Date(2026, 6, 6);

  it("renders a cross-month week in Portuguese", () => {
    expect(formatWeekRangeLabel(crossMonthWeekStart, resolveDateLocale("pt"))).toBe(
      "31 ago–6 set"
    );
  });

  it("renders a cross-month week in English", () => {
    expect(formatWeekRangeLabel(crossMonthWeekStart, resolveDateLocale("en"))).toBe(
      "31 Aug–6 Sep"
    );
  });

  it("renders a same-month week compactly in Portuguese", () => {
    expect(formatWeekRangeLabel(sameMonthWeekStart, resolveDateLocale("pt"))).toBe(
      "6–12 jul"
    );
  });

  it("renders a same-month week compactly in English", () => {
    expect(formatWeekRangeLabel(sameMonthWeekStart, resolveDateLocale("en"))).toBe(
      "6–12 Jul"
    );
  });

  it("changes its output when the language changes", () => {
    // The regression guard for the bug: the same week formatted through two
    // languages must not produce the same string.
    expect(formatWeekRangeLabel(crossMonthWeekStart, resolveDateLocale("pt"))).not.toBe(
      formatWeekRangeLabel(crossMonthWeekStart, resolveDateLocale("en"))
    );
  });
});
