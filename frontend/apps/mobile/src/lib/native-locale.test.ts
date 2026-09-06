import { describe, expect, it } from "vitest";

import { nativeLocaleTag } from "./native-locale";

describe("nativeLocaleTag", () => {
  it("maps the app's two languages to real region tags", () => {
    expect(nativeLocaleTag("pt")).toBe("pt-PT");
    expect(nativeLocaleTag("en")).toBe("en-US");
  });

  it("uses only the primary subtag of a region-tagged code", () => {
    expect(nativeLocaleTag("pt-BR")).toBe("pt-PT");
    expect(nativeLocaleTag("en-GB")).toBe("en-US");
    expect(nativeLocaleTag("EN")).toBe("en-US");
  });

  it("falls back to Portuguese, like resolveDateLocale does", () => {
    expect(nativeLocaleTag("fr")).toBe("pt-PT");
    expect(nativeLocaleTag(undefined)).toBe("pt-PT");
    expect(nativeLocaleTag(null)).toBe("pt-PT");
    expect(nativeLocaleTag("")).toBe("pt-PT");
  });
});
