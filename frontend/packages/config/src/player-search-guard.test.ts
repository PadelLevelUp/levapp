import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * players.search rule 9 (PAD-665): no surface of rule 8 compares a player's name the raw way.
 * A surface passes when none of its files contains `.toLowerCase().includes(` and at least one
 * of them imports the shared rule. The only exception is the student side of the messaging
 * screens, kept in one local helper, `legacyContains` ("student side, out of PAD-665 scope
 * (players.search rule 8)").
 */
const ROOT = join(__dirname, "..", "..", "..", "apps");
const WEB = "web/src/";
const MOBILE = "mobile/";

// Each surface: its files (the screen, plus the helper that holds its comparison when the screen
// delegates). A file may delegate to another through "@levelup/config" or "./name-search".
const SURFACES: Record<string, string[]> = {
  "web PlayerSelector": [`${WEB}components/calendar/PlayerSelector.tsx`],
  "web ManualNotificationModal": [`${WEB}components/calendar/ManualNotificationModal.tsx`],
  "web PresencePlayersTable": [
    `${WEB}components/presences/PresencePlayersTable.tsx`,
    `${WEB}components/presences/presenceSearch.ts`,
  ],
  "web NewConversationDialog": [`${WEB}components/messages/NewConversationDialog.tsx`],
  "web ConversationList": [`${WEB}components/messages/ConversationList.tsx`],
  "config walk-in-options": ["../packages/config/src/walk-in-options.ts"],
  "config waiting-list-origin": ["../packages/config/src/waiting-list-origin.ts"],
  "mobile player-selector-logic": [`${MOBILE}src/features/calendar/player-selector-logic.ts`],
  "mobile notify-modal": [`${MOBILE}src/features/calendar/notify-modal.tsx`],
  "mobile report-state": [`${MOBILE}src/features/presences/report-state.ts`],
  "mobile new conversation": [`${MOBILE}app/conversation/new.tsx`],
  "mobile messages tab": [`${MOBILE}app/(tabs)/messages.tsx`],
  // The shared helpers the screens above call; their student side is the one allowed exception.
  "config player-search": ["../packages/config/src/player-search.ts"],
};

const RAW = ".toLowerCase().includes(";
const SHARED_IMPORT = /from\s+["'](@levelup\/config|\.\/name-search)["']/;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** The source without the one allowed helper definition (and its comment). */
function withoutLegacyHelper(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.includes("legacyContains") && !line.includes("student side, out of PAD-665 scope"))
    .join("\n")
    // the helper's body is on the line after its declaration
    .replace(/^\s*name\.toLowerCase\(\)\.includes\(query\.toLowerCase\(\)\);?\s*$/m, "");
}

describe("players.search guard (rule 9)", () => {
  for (const [surface, files] of Object.entries(SURFACES)) {
    it(`${surface}: no raw name comparison, and the shared rule is used`, () => {
      for (const file of files) {
        expect(withoutLegacyHelper(read(file)), `${file} compares a name the raw way`).not.toContain(RAW);
      }
      const usesShared = files.some((file) => SHARED_IMPORT.test(read(file)));
      expect(usesShared, `${surface} does not import the shared rule`).toBe(true);
    });
  }

  it("the messaging screens reach the shared rule through searchPeopleByName", () => {
    for (const file of [
      `${WEB}components/messages/NewConversationDialog.tsx`,
      `${WEB}components/messages/ConversationList.tsx`,
      `${MOBILE}app/conversation/new.tsx`,
      `${MOBILE}app/(tabs)/messages.tsx`,
    ]) {
      expect(read(file), file).toContain("searchPeopleByName(");
    }
  });
});
