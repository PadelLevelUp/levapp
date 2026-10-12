import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

/** client.route-loading rule 6 (PAD-585): "English arrives before the switch". */
describe("lazy locale", () => {
  it("bundles Portuguese and loads English when changeLanguage asks for it", async () => {
    expect(i18n.hasResourceBundle("pt", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(false);
    const ptLabel = i18n.t("nav.calendar");

    await i18n.changeLanguage("en");

    expect(i18n.language).toBe("en");
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
    const enLabel = i18n.t("nav.calendar");
    expect(enLabel).not.toBe("nav.calendar");
    expect(enLabel).not.toBe(ptLabel);
    await i18n.changeLanguage("pt");
  });
});
