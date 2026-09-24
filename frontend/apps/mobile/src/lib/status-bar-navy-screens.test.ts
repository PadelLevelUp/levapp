/**
 * PAD-419 (mobile.status-bar rule 4, from Session-B's #415 review). A light `Screen` asks for
 * dark status-bar content and, in a native stack, stays mounted under whatever it pushes. So a
 * pushed route that paints its OWN top navy (`lightTheme.sidebarBackground`) must render its own
 * `<StatusBar style="light" />`: mounted later, it wins while shown, and unmounting it gives the
 * screen beneath its dark content back. This scans every route file so a new navy screen can't
 * forget it.
 *
 * PAD-434: navy is either marker — the `lightTheme.sidebarBackground` token or the `bg-sidebar`
 * class (connect, verify-email and the auth screens). The scan only knew the token, so `/connect`,
 * pushed from the student dashboard, showed the dashboard's dark glyphs on navy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..", "..", "app");

/** The two ways a route paints navy: the theme token, or the `bg-sidebar` class (whole word). */
const NAVY = /lightTheme\.sidebarBackground|(?<![\w-])bg-sidebar(?![\w-])/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    // Tab screens sit at the base of the stack under the root's "light"; the rule is about
    // routes PUSHED over a light Screen, so the (tabs) group is out of scope.
    if (statSync(path).isDirectory()) return name === "(tabs)" ? [] : routeFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

describe("navy self-headed routes set their own light status bar (PAD-419)", () => {
  it("every route painting navy renders <StatusBar style=\"light\" />", () => {
    const navy = routeFiles(APP).filter((f) => NAVY.test(readFileSync(f, "utf8")));
    // Both markers are live: a scan that finds only one of them has lost the other.
    expect(navy.map((f) => relative(APP, f))).toEqual(expect.arrayContaining(["settings.tsx", "connect.tsx"]));
    const missing = navy
      .filter((f) => !/<StatusBar\s+style="light"\s*\/>/.test(readFileSync(f, "utf8")))
      .map((f) => relative(APP, f));
    expect(missing).toEqual([]);
  });
});
