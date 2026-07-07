import { describe, it, expect } from "vitest";
import {
  radius,
  lightThemeHsl,
  darkThemeHsl,
  lightTheme,
  darkTheme,
  nativewindTheme,
  type ThemeHsl,
} from "./tokens";

// "<hue> <sat>% <light>%" raw triplet, e.g. "152 60% 42%"
const TRIPLET_RE = /^\d{1,3} \d{1,3}% \d{1,3}%$/;
// "hsl(<hue> <sat>% <light>%)"
const HSL_RE = /^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/;

const SEMANTIC_COLORS = [
  "border",
  "input",
  "ring",
  "background",
  "foreground",
  "primary",
  "secondary",
  "destructive",
  "muted",
  "accent",
  "popover",
  "card",
  "sidebar",
  "academy",
  "private",
  "success",
  "warning",
  "info",
] as const;

describe("design token invariants", () => {
  it("brand primary is the padel court green in the light theme", () => {
    expect(lightThemeHsl.primary).toBe("152 60% 42%");
    expect(lightTheme.primary).toBe("hsl(152 60% 42%)");
  });

  it("radius matches --radius in apps/web/src/index.css", () => {
    expect(radius).toBe("0.625rem");
  });

  it("raw themes contain only well-formed HSL triplets", () => {
    for (const [key, value] of Object.entries(lightThemeHsl)) {
      expect(value, `lightThemeHsl.${key}`).toMatch(TRIPLET_RE);
    }
    for (const [key, value] of Object.entries(darkThemeHsl)) {
      expect(value, `darkThemeHsl.${key}`).toMatch(TRIPLET_RE);
    }
  });

  it("hsl() themes wrap every raw triplet, key-for-key", () => {
    expect(Object.keys(lightTheme)).toEqual(Object.keys(lightThemeHsl));
    expect(Object.keys(darkTheme)).toEqual(Object.keys(darkThemeHsl));
    for (const [key, value] of Object.entries(lightTheme)) {
      expect(value, `lightTheme.${key}`).toMatch(HSL_RE);
      expect(value).toBe(`hsl(${lightThemeHsl[key as keyof ThemeHsl]})`);
    }
    for (const [key, value] of Object.entries(darkTheme)) {
      expect(value, `darkTheme.${key}`).toMatch(HSL_RE);
    }
  });

  it("light and dark themes expose the same token set", () => {
    expect(Object.keys(darkThemeHsl)).toEqual(Object.keys(lightThemeHsl));
  });

  it("warning uses the effective (unlayered-override) value in both themes", () => {
    expect(lightThemeHsl.warning).toBe("38 92% 50%");
    expect(darkThemeHsl.warning).toBe("38 92% 50%");
  });
});

describe("nativewindTheme", () => {
  it.each(["light", "dark"] as const)(
    "returns entries for all semantic colors in %s mode",
    (mode) => {
      const theme = nativewindTheme(mode) as Record<string, unknown>;
      for (const color of SEMANTIC_COLORS) {
        expect(theme[color], `${mode}.${color}`).toBeDefined();
      }
    }
  );

  it("defaults to light mode", () => {
    expect(nativewindTheme()).toEqual(nativewindTheme("light"));
  });

  it("maps DEFAULT/foreground pairs from the theme", () => {
    const light = nativewindTheme("light");
    expect(light.primary).toEqual({
      DEFAULT: lightTheme.primary,
      foreground: lightTheme.primaryForeground,
    });
    const dark = nativewindTheme("dark");
    expect(dark.primary.DEFAULT).toBe(darkTheme.primary);
    expect(dark.primary.DEFAULT).not.toBe(light.primary.DEFAULT);
  });

  it("mirrors the sidebar block of tailwind.config.ts", () => {
    const light = nativewindTheme("light");
    expect(light.sidebar).toEqual({
      DEFAULT: lightTheme.sidebarBackground,
      foreground: lightTheme.sidebarForeground,
      primary: lightTheme.sidebarPrimary,
      "primary-foreground": lightTheme.sidebarPrimaryForeground,
      accent: lightTheme.sidebarAccent,
      "accent-foreground": lightTheme.sidebarAccentForeground,
      border: lightTheme.sidebarBorder,
      ring: lightTheme.sidebarRing,
    });
  });

  it("exposes the messaging extras (online dot, unread = primary)", () => {
    const light = nativewindTheme("light");
    expect(light.online).toBe("#22c55e");
    expect(light.unread).toBe(lightTheme.primary);
  });
});
