/**
 * PAD-342 — the E2E locale helper resolves a role's accessible name from the
 * locale files in both languages, so a spec matches whichever language the page
 * rendered and follows a rename instead of breaking on it.
 */
import { describe, expect, it } from "vitest";

import { ui, uiText } from "../../e2e/helpers/i18n";

describe("e2e i18n helper (R-013)", () => {
  it("reads a key the way the app's t() does: <file>.<path>", () => {
    expect(uiText("calendar.detail.delete", "en")).toBe("Delete");
    expect(uiText("calendar.detail.delete", "pt")).toBe("Eliminar");
  });

  it("matches the rendered name in either language, anchored and case-insensitive", () => {
    const name = ui("calendar.detail.delete");
    expect(name.test("Delete")).toBe(true);
    expect(name.test("eliminar")).toBe(true);
    expect(name.test("Delete class")).toBe(false);
    expect(ui("calendar.detail.delete", { exact: false }).test("Delete class")).toBe(true);
  });

  it("escapes regex characters and turns interpolation slots into wildcards", () => {
    expect(ui("calendar.detail.deleteConfirmTitle").test("Delete this class?")).toBe(true);
    const until = ui("calendar.detail.untilDate", { exact: false });
    expect(until.test(uiText("calendar.detail.untilDate", "en").replace("{{date}}", "3 Oct"))).toBe(true);
  });

  it("throws on a missing key instead of matching nothing", () => {
    expect(() => uiText("calendar.detail.noSuchKey", "en")).toThrow(/no "calendar.detail.noSuchKey"/);
    expect(() => ui("nope.nope")).toThrow();
  });
});
