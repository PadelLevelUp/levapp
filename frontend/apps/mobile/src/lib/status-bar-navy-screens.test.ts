/**
 * PAD-419 (mobile.status-bar rule 4, from Session-B's #415 review). A light `Screen` asks for
 * dark status-bar content and, in a native stack, stays mounted under whatever it pushes. So a
 * pushed route that paints its OWN top navy (`lightTheme.sidebarBackground`) must render its own
 * `<StatusBar style="light" />`: mounted later, it wins while shown, and unmounting it gives the
 * screen beneath its dark content back. This scans every route file so a new navy screen can't
 * forget it.
 *
 * PAD-434: navy is either marker — the `lightTheme.sidebarBackground` token or the `bg-sidebar`
 * class (connect, verify-email and the auth screens). The scan only knew the token, so those seven
 * relied on whatever sat beneath them: light today (the dashboard asks for no style, Settings sets
 * light), dark the day one is pushed from a titled light Screen.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..", "..", "app");
const SRC = join(__dirname, "..");

/**
 * The ways a screen paints navy. In a route file: the theme token, or the `bg-sidebar` class
 * (whole word). Under src/ only a SCREEN ROOT counts — a `flex-1` element whose class list has
 * `bg-sidebar` (PreAuthShell, JoinCoachScreen; C's #423 review) — so a navy chip or card
 * (calendar, dashboard blocks) or a board drawn with the token is not a screen.
 */
const MARKERS = {
  token: /lightTheme\.sidebarBackground/,
  routeClass: /(?<![\w-])bg-sidebar(?![\w-])/,
  screenRoot: /className="(?=[^"]*(?<![\w-])flex-1(?![\w-]))[^"]*(?<![\w-])bg-sidebar(?![\w-])[^"]*"/,
};
const LIGHT_BAR = /<StatusBar\s+style="light"\s*\/>/;

function tsxFiles(dir: string, skip: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip(name)) return [];
    if (statSync(path).isDirectory()) return tsxFiles(path, skip);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

// Tab screens sit at the base of the stack under the root's "light"; the rule is about screens
// PUSHED over a light Screen, so the (tabs) group is out of scope.
const routes = tsxFiles(APP, (name) => name === "(tabs)");
const components = tsxFiles(SRC, () => false);
const read = (f: string) => readFileSync(f, "utf8");

const navyRoutes = routes.filter((f) => MARKERS.token.test(read(f)) || MARKERS.routeClass.test(read(f)));
const navyRoots = components.filter((f) => MARKERS.screenRoot.test(read(f)));

describe("navy self-headed screens set their own light status bar (PAD-419, PAD-434)", () => {
  it("every marker still finds a navy screen (a marker that matches nothing has gone stale)", () => {
    expect(routes.filter((f) => MARKERS.token.test(read(f))).length).toBeGreaterThan(0);
    expect(routes.filter((f) => MARKERS.routeClass.test(read(f))).length).toBeGreaterThan(0);
    expect(navyRoots.length).toBeGreaterThan(0);
  });

  it("a navy chip or card is not a screen root", () => {
    expect(MARKERS.screenRoot.test('className="h-12 w-12 items-center rounded-full bg-sidebar"')).toBe(false);
    expect(MARKERS.screenRoot.test('className="rounded-2xl bg-sidebar p-5"')).toBe(false);
    expect(MARKERS.screenRoot.test('className="flex-1 bg-sidebar-accent"')).toBe(false);
    expect(MARKERS.screenRoot.test('className="flex-1 justify-center bg-sidebar p-4"')).toBe(true);
  });

  it("every navy route and navy screen root renders <StatusBar style=\"light\" />", () => {
    const missing = [...navyRoutes, ...navyRoots]
      .filter((f) => !LIGHT_BAR.test(read(f)))
      .map((f) => relative(join(APP, ".."), f));
    expect(missing).toEqual([]);
  });
});
