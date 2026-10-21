/**
 * PAD-683 (players.nickname rule 9d, B-631) — the guard: no iOS/Android view prints a student's real name
 * through a player-name accessor without resolving the coach's display name, unless the file is
 * in COACH_NAME_LIST with its exact count and a reason. See packages/config/src/coach-name-scan.ts.
 *
 * The scanner is validated before it is trusted ("the scanner catches a bypass").
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  countByFile,
  renderCoachNameList,
  scanCoachNames,
  type NameHit,
} from "@levelup/config/src/coach-name-scan";
import { COACH_NAME_LIST } from "./coach-display-name-list";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../..");
const ROOTS = [resolve(APP_ROOT, "app"), resolve(APP_ROOT, "src")];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test" || entry === "__mocks__" || entry === "__fixtures__") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts") && entry !== "coach-display-name-list.ts") {
      out.push(full);
    }
  }
  return out.sort();
}

const hits: NameHit[] = ROOTS.flatMap(walk).flatMap((f) =>
  scanCoachNames(relative(APP_ROOT, f), readFileSync(f, "utf8"))
);
const counts = countByFile(hits);

if (process.env.UPDATE_COACH_NAME_LIST === "1") {
  writeFileSync(
    resolve(HERE, "coach-display-name-list.ts"),
    renderCoachNameList("COACH_NAME_LIST", hits, COACH_NAME_LIST)
  );
}

describe("coach display-name guard (PAD-683)", () => {
  it("the scanner catches a bypass and passes a resolved name", () => {
    const src = [
      '<span className="text-sm">{inv.playerName}</span>',
      "<Row name={p.name} />",
      "title: player.user?.name,",
      "// a comment about req.playerName",
      "<span>{displayName(inv.playerId, inv.playerName)}</span>",
      "name={p.displayName ?? p.name}",
      "const club = club.name;",
    ].join("\n");
    expect(scanCoachNames("x.tsx", src).map((h) => h.line)).toEqual([1, 2, 3]);
  });

  it("walks the app's source (an empty walk would pass vacuously)", () => {
    expect(ROOTS.flatMap(walk).length, "source files scanned").toBeGreaterThan(100);
  });

  it("every hit is in a listed file, with the exact count", () => {
    const listed = new Map(COACH_NAME_LIST.map((e) => [e.file, e.max]));
    const unlisted = hits.filter((h) => !listed.has(h.file)).map((h) => `${h.file}:${h.line}  ${h.text}`);
    expect(unlisted, "resolve these through useCoachDisplayName / coachDisplayName").toEqual([]);
    const wrong = COACH_NAME_LIST.filter((e) => (counts[e.file] ?? 0) !== e.max).map(
      (e) => `${e.file}: listed ${e.max}, found ${counts[e.file] ?? 0}`
    );
    expect(wrong, "more: resolve the new hit; fewer: lower max (or delete the entry)").toEqual([]);
  });

  it("every listed file has a reviewed reason", () => {
    expect(COACH_NAME_LIST.filter((e) => e.reason.startsWith("UNREVIEWED")).map((e) => e.file)).toEqual([]);
  });
});
