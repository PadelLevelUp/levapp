/**
 * PAD-419 (mobile.status-bar rule 4, from Session-B's #415 review). A light `Screen` asks for
 * dark status-bar content and, in a native stack, stays mounted under whatever it pushes. So a
 * pushed route that paints its OWN top navy (`lightTheme.sidebarBackground`) must render its own
 * `<StatusBar style="light" />`: mounted later, it wins while shown, and unmounting it gives the
 * screen beneath its dark content back. This scans every route file so a new navy screen can't
 * forget it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..", "..", "app");

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
  it("every route painting lightTheme.sidebarBackground renders <StatusBar style=\"light\" />", () => {
    const navy = routeFiles(APP).filter((f) => readFileSync(f, "utf8").includes("lightTheme.sidebarBackground"));
    expect(navy.length).toBeGreaterThan(0);
    const missing = navy
      .filter((f) => !/<StatusBar\s+style="light"\s*\/>/.test(readFileSync(f, "utf8")))
      .map((f) => relative(APP, f));
    expect(missing).toEqual([]);
  });
});
