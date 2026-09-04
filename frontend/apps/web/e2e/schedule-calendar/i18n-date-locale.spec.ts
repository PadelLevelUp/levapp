import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar, openSettings } from "../helpers/navigation";

/**
 * PAD-52: locale-aware date formatting across the calendar.
 *
 * Several calendar components (MobileCalendarView.tsx, CalendarHeader.tsx,
 * EventDetailSheet.tsx, RescheduleDialog.tsx, ClassDetailSheet.tsx) used to
 * hardcode date-fns `enUS`/`enGB` locale objects when calling `format(...)`,
 * so weekday/month labels always rendered in English regardless of the coach's
 * selected UI language. MobileCalendarView.tsx also baked a stray Portuguese
 * `'de'` literal into an otherwise-English format string
 * (`"EEEE d 'de' MMMM"`), leaking "de" into English output.
 *
 * The fix routes every site through `dateFnsLocale(i18n.language)`
 * (apps/web/src/lib/dateLocale.ts) so labels follow the active language, and
 * drops the stray `'de'` literal.
 *
 * The E2E coach is seeded with language="en" (see e2e/scripts/seed.py), so the
 * app renders in English by default. Only the second test switches to
 * Portuguese, and it restores English afterwards so later specs keep matching
 * English copy — mirroring settings/language-preference.spec.ts. All language
 * switching happens at the default (desktop) viewport; the Settings UI is not
 * exercised under the mobile viewport.
 */

// Mobile viewport (< 768px, see hooks/use-mobile.tsx MOBILE_BREAKPOINT) makes
// CalendarPage render MobileCalendarView instead of the desktop CalendarHeader.
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const EN_WEEKDAY = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/;
const PT_WEEKDAY = /^(seg|ter|qua|qui|sex|s[áa]b|dom)\.?$/i;
const EN_MONTH =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/;

// Duplicated from settings/language-preference.spec.ts (helpers not exported
// there). The selector button/heading text flips with the active language, so
// bilingual locators are required. Always run these at the desktop viewport.
async function openPreferences(page: Page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: /^(preferences|preferências)$/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /^(preferences|preferências)$/i })
  ).toBeVisible({ timeout: 5000 });
}

async function selectLanguage(page: Page, option: RegExp) {
  await page.getByLabel(/language|idioma/i).click();
  await page.getByRole("option", { name: option }).click();
  await page
    .getByRole("button", { name: /save changes|guardar altera/i })
    .click();
  await expect(
    page.getByText(/settings saved|saved|guardad|preferências/i).first()
  ).toBeVisible({ timeout: 5000 });
}

test.describe("PAD-52: calendar locale-aware date formatting", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test("PAD-52: mobile calendar day header renders localized month and no stray 'de' literal", async ({
    page,
  }) => {
    // Coach language is English by default — no language switch needed here, so
    // this test never touches the shared coach preference in the seed DB.
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openCalendar(page);

    // MobileCalendarView renders the selected-day heading as an <h3>. With the
    // old code it was `format(selectedDay, "EEEE d 'de' MMMM", { locale: enUS })`
    // -> e.g. "Friday 10 de July", leaking the Portuguese "de" into English
    // output. The fix formats it as "EEEE, d MMMM" through the locale helper.
    const dayHeader = page.locator("h3.font-semibold").first();
    await expect(dayHeader).toBeVisible({ timeout: 5000 });

    const headerText = (await dayHeader.textContent()) ?? "";
    // English month name proves the header follows the (English) UI language...
    expect(headerText).toMatch(EN_MONTH);
    // ...and there is no stray standalone "de" artifact.
    expect(headerText).not.toMatch(/\bde\b/i);

    // Restore the default viewport for hygiene.
    await page.setViewportSize(DESKTOP_VIEWPORT);
  });

  test("PAD-52: desktop calendar weekday labels follow the selected language", async ({
    page,
  }) => {
    // Default English: the desktop CalendarHeader weekday row shows English
    // abbreviations (Mon/Tue/...). Pre-fix it hardcoded enGB, so this passed
    // before AND after — it's the baseline the Portuguese assertion contrasts.
    await openCalendar(page);
    await expect(page.getByText(EN_WEEKDAY).first()).toBeVisible({
      timeout: 5000,
    });

    // Switch to Portuguese (desktop viewport, reliable Settings flow).
    await openPreferences(page);
    await selectLanguage(page, /portugu/i);
    await openCalendar(page);

    // Confirm the app is now in Portuguese (nav chrome re-rendered)...
    await expect(
      page.getByRole("link", { name: "Calendário" })
    ).toBeVisible({ timeout: 5000 });
    // ...the weekday header now shows Portuguese abbreviations...
    await expect(page.getByText(PT_WEEKDAY).first()).toBeVisible({
      timeout: 5000,
    });
    // ...and NO English weekday abbreviation survives. Pre-fix, CalendarHeader
    // hardcoded enGB and kept rendering English weekdays here regardless of
    // language — this is the assertion that fails without the fix.
    await expect(page.getByText(EN_WEEKDAY)).toHaveCount(0);

    // PAD-181 (calendar.view rule 12): the week-range label comes from
    // useCalendar's `weekLabel` in @levelup/hooks, which hardcoded enGB long
    // after PAD-52 fixed the components around it — a Portuguese coach still
    // read "31 Aug–6 Sep". It must now use Portuguese month abbreviations.
    // Scoped to <main>: Radix Sheet/Dialog titles also render as <h2>, but they
    // portal to <body>, so scoping here keeps this on CalendarToolbar's label
    // even if a sheet is open.
    const weekLabel = page
      .getByRole("main")
      .getByRole("heading", { level: 2 })
      .first();
    await expect(weekLabel).toBeVisible({ timeout: 5000 });
    const weekLabelText = (await weekLabel.textContent())?.trim() ?? "";
    // Case-sensitive on purpose: date-fns renders Portuguese abbreviations in
    // lower case ("ago", "set") and English ones capitalized ("Aug", "Sep"), so
    // this stays a real assertion in the weeks where the two spellings would
    // otherwise collide (e.g. "jul" vs "Jul").
    expect(weekLabelText).toMatch(
      /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/
    );
    expect(weekLabelText).not.toMatch(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/
    );

    // Restore English so the shared seed DB / later specs stay in English.
    await openPreferences(page);
    await selectLanguage(page, /english|inglês/i);
    await openCalendar(page);
    await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible({
      timeout: 5000,
    });
  });
});
