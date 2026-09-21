/**
 * PAD-392 (B-155) guard: a hook that LOADS server data into local state must not
 * depend on `t` or `toast`.
 *
 * `t` gets a new identity whenever the language changes — on web that is every page
 * load (i18n starts at "pt", then the account's language is applied), on iOS at sign-in
 * and from the language selector. A loading effect that lists it re-runs, and its
 * reload replaces local state: in an editable section (working hours, seasons,
 * evaluation categories) that silently undid whatever the user had just changed.
 *
 * What is scanned: every `useEffect` / `useLayoutEffect` in the web and mobile apps —
 * and every `useCallback` that some effect in the same file lists in ITS deps, so it is
 * re-run when its identity changes — whose dependency array names one of UNSTABLE, and
 * whose body both calls something that looks like a fetch and calls a state setter.
 *
 * It is a heuristic, not a proof: "looks like a fetch" is a name pattern (`*Api.x(`,
 * `get…(`, `list…(`, `fetch…(`, `load…(`), so a loader that calls something else is not
 * seen — web's verify-email `send` is one. It catches the shape that bit us.
 *
 * Ratchet: REVIEWED lists the loaders that were read and found harmless (they refetch a
 * read-only list; nothing unsaved lives in the state they replace). A NEW offender
 * fails. A REVIEWED entry that no longer offends also fails, so the list can only
 * shrink. To fix an offender: read `t` through a ref and drop it from the deps.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/** Widen here if another unstable identity turns up (one line). */
const UNSTABLE = ["t", "toast"];

const FRONTEND = join(__dirname, "../../../..");
const ROOTS = ["apps/web/src", "apps/mobile/app", "apps/mobile/src"];

const FETCH = /\b(\w*[Aa]pi\.\w+|get[A-Z]\w*|list[A-Z]\w*|fetch[A-Z]\w*|load[A-Z]\w*)\s*\(/g;
const SETTER = /\bset[A-Z]\w*\s*\(/;
const HOOK = /\b(?:React\.)?use(Effect|LayoutEffect|Callback)\s*\(/;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function offenders(): string[] {
  const found = new Set<string>();
  const unstable = new RegExp(`(?<![\\w.])(${UNSTABLE.join("|")})(?![\\w.(])`);
  for (const root of ROOTS) {
    for (const file of files(join(FRONTEND, root))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\},\s*\[([^\]]*)\]\s*\)/g)) {
        if (!unstable.test(m[1])) continue;
        const lines = src.slice(0, m.index).split("\n");
        let i = lines.length - 1;
        while (i >= 0 && lines.length - i < 160 && !HOOK.test(lines[i])) i--;
        if (i < 0 || !HOOK.test(lines[i])) continue;
        const body = lines.slice(i).join("\n");
        const fetched = [...body.matchAll(FETCH)].map((f) => f[1]);
        if (fetched.length === 0 || !SETTER.test(body)) continue;
        // A callback is only a risk if an EFFECT runs it when its identity changes
        // (`useEffect(() => { void refresh(); }, [refresh])`). A submit handler that is
        // merely re-created is not a load.
        if (/useCallback/.test(lines[i])) {
          const name = /const\s+(\w+)\s*=/.exec(lines[i])?.[1];
          const runByEffect = name && new RegExp(`\\},\\s*\\[[^\\]]*\\b${name}\\b[^\\]]*\\]\\s*\\)`).test(src);
          if (!runByEffect) continue;
        }
        found.add(`${relative(FRONTEND, file)} :: ${fetched[0]}`);
      }
    }
  }
  return [...found].sort();
}

/** Read one by one for PAD-392: each refetches read-only data; nothing unsaved is replaced. */
const REVIEWED: string[] = [
  // Generated from this guard's own scan (PRINT_OFFENDERS=1), 2026-09-21, then read one by one.
  // iOS verify-email: the effect that runs `send` is fenced by an `autoSent` ref — a re-run sends nothing.
  "apps/mobile/app/verify-email.tsx :: authApi.sendEmailVerificationCode",
  // Admin: a refetch of the pending list and of a setting that PUTs at once — no unsaved state.
  "apps/mobile/src/features/settings/admin-section.tsx :: adminApi.listPendingCoaches",
  "apps/web/src/components/settings/AdminSection.tsx :: listPendingCoaches",
  // Club join requests: a read-only list; deciding one is an immediate action.
  "apps/mobile/src/features/settings/club-section.tsx :: clubsApi.listClubJoinRequests",
  "apps/web/src/components/settings/ClubSection.tsx :: listClubJoinRequests",
  // Read-only lists and statistics.
  "apps/mobile/src/features/settings/import-section.tsx :: getImportHistory",
  "apps/web/src/components/players/detail/AddToClassesDialog.tsx :: getClassInstances",
  "apps/web/src/pages/PresencesPage.tsx :: getCoachPlayers",
  "apps/web/src/pages/PresencesPage.tsx :: getPendingValidation",
  "apps/web/src/pages/PresencesPage.tsx :: getPresenceStats",
];

describe("loading hooks do not depend on t / toast (PAD-392)", () => {
  const found = offenders();
  // Regenerate the baseline from the guard's own scan: PRINT_OFFENDERS=1 npx vitest run <this file>
  if (process.env.PRINT_OFFENDERS) console.log("OFFENDERS\n" + found.map((o) => `  "${o}",`).join("\n"));

  it("finds no loader that depends on t/toast beyond the reviewed ones", () => {
    expect(found.filter((o) => !REVIEWED.includes(o)), "NEW offenders — read t through a ref").toEqual([]);
  });

  it("has no reviewed entry that stopped offending (the list only shrinks)", () => {
    expect(REVIEWED.filter((o) => !found.includes(o)), "remove these from REVIEWED").toEqual([]);
  });
});
