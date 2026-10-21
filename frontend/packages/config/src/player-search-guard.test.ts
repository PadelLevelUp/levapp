import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * players.search rule 9 (PAD-665): no surface of rule 8 compares a player's name the raw way, and
 * each one calls the shared rule by name — not merely imports something from @levelup/config
 * (R-032: the guard proves it found its subject). The only raw comparison allowed is the student
 * side of the messaging screens, the one-line body of `legacyContains` in player-search.ts
 * ("student side, out of PAD-665 scope (players.search rule 8)").
 */
const ROOT = join(__dirname, "..", "..", "..", "apps");
const WEB = "web/src/";
const MOBILE = "mobile/";
const CONFIG = "../packages/config/src/";

// Each surface: the file that holds its comparison, and the shared function it must call.
const SURFACES: Record<string, { file: string; calls: string }> = {
  "web PlayerSelector": { file: `${WEB}components/calendar/PlayerSelector.tsx`, calls: "searchRoster" },
  "web ManualNotificationModal": { file: `${WEB}components/calendar/ManualNotificationModal.tsx`, calls: "searchRoster" },
  "web presences table": { file: `${WEB}components/presences/presenceSearch.ts`, calls: "searchPlayers" },
  "web NewConversationDialog": { file: `${WEB}components/messages/NewConversationDialog.tsx`, calls: "searchPeopleByName" },
  "web ConversationList": { file: `${WEB}components/messages/ConversationList.tsx`, calls: "searchPeopleByName" },
  "config walk-in-options": { file: `${CONFIG}walk-in-options.ts`, calls: "searchPlayers" },
  "config waiting-list-origin": { file: `${CONFIG}waiting-list-origin.ts`, calls: "searchPlayers" },
  "mobile player-selector-logic": { file: `${MOBILE}src/features/calendar/player-selector-logic.ts`, calls: "searchRoster" },
  "mobile notify-modal": { file: `${MOBILE}src/features/calendar/notify-modal.tsx`, calls: "searchRoster" },
  "mobile presences": { file: `${MOBILE}src/features/presences/report-state.ts`, calls: "searchPlayers" },
  "mobile new conversation": { file: `${MOBILE}app/conversation/new.tsx`, calls: "searchPeopleByName" },
  "mobile messages tab": { file: `${MOBILE}app/(tabs)/messages.tsx`, calls: "searchPeopleByName" },
};
// The web presences screen delegates to presenceSearch.ts; the screen itself must not compare raw.
const ALSO_RAW_FREE = [`${WEB}components/presences/PresencePlayersTable.tsx`, `${CONFIG}player-search.ts`];

const ALLOWED_LINE = "name.toLowerCase().includes(query.toLowerCase());";

/**
 * The raw comparisons in a source: comments dropped, whitespace around `.` collapsed, then any
 * lower-casing followed by includes/indexOf/startsWith, or includes/indexOf of a lower-cased value.
 */
function rawComparisons(src: string, allowLegacy = false): string[] {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !(allowLegacy && line.trim() === ALLOWED_LINE))
    .join("\n")
    .replace(/\s*\.\s*/g, ".");
  const patterns = [
    /to(?:Locale)?(?:Lower|Upper)Case\(\)[\s\S]{0,40}?\.(?:includes|indexOf|startsWith)\(/g,
    /\.(?:includes|indexOf|startsWith)\([^()]*\.to(?:Locale)?(?:Lower|Upper)Case\(\)/g,
  ];
  return patterns.flatMap((re) => code.match(re) ?? []);
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("players.search guard (rule 9)", () => {
  for (const [surface, { file, calls }] of Object.entries(SURFACES)) {
    it(`${surface}: calls ${calls}( and compares no name the raw way`, () => {
      const src = read(file);
      expect(src, `${surface} does not call ${calls}(`).toMatch(new RegExp(`\\b${calls}\\(`));
      expect(rawComparisons(src), `${file} compares a name the raw way`).toEqual([]);
    });
  }

  it("the delegating screen and the shared helper are raw-free (the legacy line excepted)", () => {
    for (const file of ALSO_RAW_FREE) {
      expect(rawComparisons(read(file), file.endsWith("player-search.ts")), file).toEqual([]);
    }
  });

  // R-032: the guard can fail — every shape below is a raw comparison it must see.
  it.each([
    "p.name.toLowerCase().includes(q)",
    "p.name\n  .toLowerCase()\n  .includes(q)",
    "name.toLocaleLowerCase().indexOf(q) >= 0",
    "u.name.includes(q.toLowerCase())",
    "const n = u.name.toLowerCase(); return n.startsWith(q)",
  ])("sees %j", (snippet) => {
    expect(rawComparisons(snippet).length).toBeGreaterThan(0);
  });

  it("does not flag the shared rule, a comment, or the allowed legacy line", () => {
    expect(rawComparisons("searchPlayers(items, q, f)")).toEqual([]);
    expect(rawComparisons("// was: name.toLowerCase().includes(q)")).toEqual([]);
    expect(rawComparisons(`  ${ALLOWED_LINE}`, true)).toEqual([]);
    expect(rawComparisons(`  ${ALLOWED_LINE}`)).not.toEqual([]);
  });
});
