import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  radius,
  lightThemeHsl,
  darkThemeHsl,
  lightTheme,
  darkTheme,
  nativewindTheme,
  type ThemeHsl,
} from "./tokens";

const INDEX_CSS = fileURLToPath(
  new URL("../../../apps/web/src/index.css", import.meta.url)
);

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
  it("brand primary is the LevApp blue in the light theme", () => {
    expect(lightThemeHsl.primary).toBe("220 84% 47%"); // blue-600 #1355DC
    expect(lightTheme.primary).toBe("hsl(220 84% 47%)");
  });

  it("primary shifts to the lighter blue on dark, with dark text on it", () => {
    expect(darkThemeHsl.primary).toBe("213 100% 65%"); // blue-400 #4A9BFF
    expect(darkThemeHsl.primaryForeground).toBe("211 68% 7%");
  });

  it("green is reserved for success — it is never the brand primary", () => {
    // The whole point of the navy/blue scheme: blue carries identity and every
    // primary action, so green can mean exactly one thing. If primary ever goes
    // green again, a green badge stops being informative.
    expect(lightThemeHsl.success).toBe("161 78% 33%"); // green-600 #12946B
    expect(lightThemeHsl.primary).not.toBe(lightThemeHsl.success);
    expect(darkThemeHsl.primary).not.toBe(darkThemeHsl.success);
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

  it("warning is amber and pairs with dark text, not white", () => {
    // White on amber-600 is ~2.4:1 and fails contrast; the system never uses
    // amber as a solid with white on it.
    expect(lightThemeHsl.warning).toBe("31 72% 50%"); // amber-600 #D98324
    expect(lightThemeHsl.warningForeground).not.toBe("0 0% 100%");
    expect(darkThemeHsl.warningForeground).not.toBe("0 0% 100%");
  });
});

// These tokens exist twice: here (feeding apps/mobile through nativewindTheme)
// and as CSS custom properties in apps/web/src/index.css (feeding the web).
// Nothing at runtime keeps them in step, so this suite does.
describe("apps/web/src/index.css mirrors these tokens", () => {
  const css = readFileSync(INDEX_CSS, "utf8");

  /** ":root" or ".dark" block inside @layer base, as a var → value map. */
  function varsIn(selector: string): Record<string, string> {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} block not found in index.css`).toBeGreaterThan(-1);
    const body = css.slice(start, css.indexOf("\n  }", start));
    return Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
    );
  }

  const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  it.each([
    ["light", ":root", lightThemeHsl],
    ["dark", ".dark", darkThemeHsl],
  ] as const)("%s theme matches the %s block value-for-value", (_name, sel, theme) => {
    const cssVars = varsIn(sel);
    for (const [key, value] of Object.entries(theme)) {
      expect(cssVars[kebab(key)], `--${kebab(key)} in ${sel}`).toBe(value);
    }
  });

  it("defines every token in BOTH blocks, so dark never silently inherits light", () => {
    // The dark block used to omit success/warning/info and let them fall
    // through from :root, which meant light-theme status colours rendered on
    // dark surfaces. Both blocks are now complete.
    const light = varsIn(":root");
    const dark = varsIn(".dark");
    for (const key of Object.keys(lightThemeHsl)) {
      expect(light, `--${kebab(key)} missing from :root`).toHaveProperty(kebab(key));
      expect(dark, `--${kebab(key)} missing from .dark`).toHaveProperty(kebab(key));
    }
  });

  it("declares --radius once, in :root, matching the exported value", () => {
    expect(varsIn(":root").radius).toBe(radius);
  });

  it("declares no design tokens OUTSIDE @layer base", () => {
    // Unlayered declarations beat layered ones. An unlayered :root block once
    // silently overrode --warning, so the file said one thing and the browser
    // rendered another. Keep every token inside the layer.
    const layerStart = css.indexOf("@layer base {");
    const preamble = css.slice(0, layerStart);
    expect(preamble).not.toMatch(/^\s*--[\w-]+:/m);
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
    // The online dot is a live/confirmed reading, which is exactly the one job
    // green has. It used to be a hardcoded #22c55e that survived the repaint as
    // a stray from the old palette; it now tracks the success token.
    expect(light.online).toBe(lightTheme.success);
    expect(light.unread).toBe(lightTheme.primary);
  });

  it("leaks no raw hex — every colour resolves through the theme", () => {
    for (const mode of ["light", "dark"] as const) {
      const theme = nativewindTheme(mode) as Record<string, unknown>;
      const flat = JSON.stringify(theme);
      expect(flat, `${mode} theme contains a hardcoded hex`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });
});
