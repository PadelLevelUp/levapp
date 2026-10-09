import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * calendar.event-detail rule 20 (PAD-558) on iOS: the add-to-waiting-list sheet searches by
 * name. The sheet mounts react-query hooks the unit harness cannot, so this reads the source,
 * as `clone-wiring.test.ts` does. The filtering itself is `waitingListPickerOptions`, tested in
 * `@levelup/config`; this pins that the sheet feeds it the search field's text and renders only
 * its result, and that a tap on a row works while the keyboard is up. Flow 170 drives it.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHEET = fs.readFileSync(path.join(HERE, "class-waiting-list-section.tsx"), "utf8");

describe("the iOS waiting-list picker searches by name (PAD-558)", () => {
  it("has a search field bound to the sheet's search text, cleared each time it opens", () => {
    expect(SHEET).toMatch(/testID="class-waiting-list-search"[\s\S]{0,200}value=\{search\}[\s\S]{0,80}onChangeText=\{setSearch\}/);
    expect(SHEET).toMatch(/setPlayerId\(null\);\s*setSearch\(""\);/);
  });

  it("lists only what the shared search rule offers, keeping the chosen student", () => {
    expect(SHEET).toMatch(/waitingListPickerOptions\(candidates, search, playerId\)/);
    const list = SHEET.slice(SHEET.indexOf("<ScrollView style={{ maxHeight: 360 }}"));
    expect(list.indexOf("{offered.map(")).toBeGreaterThan(0);
    expect(list.indexOf("{offered.map(")).toBeLessThan(list.indexOf("class-waiting-list-candidate-"));
    expect(SHEET).not.toMatch(/\{candidates\.map\(\(c\) =>/);
  });

  it("says how long each student is on the list, and only a coach-wide standing row that it is managed in Settings (PAD-560, rule 19)", () => {
    expect(SHEET).toMatch(/const scope = waitingListScopeLabel\(row, \(iso\) => formatShortDate\(iso, nativeLocaleTag\(i18n\.language\)\)\);/);
    expect(SHEET).toMatch(/testID=\{`class-waiting-list-row-scope-\$\{row\.playerId\}-\$\{row\.scope\}`\}[\s\S]{0,200}\{t\(scope\.key, scope\.params\)\}/);
    expect(SHEET).toMatch(/\{waitingListRowIsManagedInSettings\(row\) \? \([\s\S]{0,120}class-waiting-list-managed-\$\{row\.playerId\}[\s\S]{0,160}waitingListManagedInSettings/);
  });

  it("lets a row take a tap while the keyboard is open", () => {
    expect(SHEET).toMatch(/<ScrollView style=\{\{ maxHeight: 360 \}\} keyboardShouldPersistTaps="handled">/);
  });
});
