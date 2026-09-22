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
 * Not seen, by design or limit: a helper defined in another file; `useFocusEffect(useCallback(…))`
 * on mobile (no current loader uses it); a body longer than 160 lines; packages/* (grepped once,
 * nothing there). Renaming a fetch helper to something outside the FETCH pattern silences it —
 * the mutants below pin the shapes it must keep seeing.
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

/** `const { t: tr } = useTranslation()` → the deps token is `tr`; `toast` likewise. */
function unstableNamesIn(src: string): string[] {
  const names = new Set(UNSTABLE);
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*use(?:Translation|Toast)\(/g)) {
    for (const part of m[1].split(",")) {
      const [orig, alias] = part.split(":").map((x) => x.trim());
      if (UNSTABLE.includes(orig) && alias) names.add(alias);
    }
  }
  return [...names];
}

/**
 * A body that only calls a helper (`void load();`, `load()`, or `useEffect(load, …)`) is
 * judged by that helper's own text: everything from its declaration to the next
 * declaration or hook at the same indentation (good enough for the shapes that bit us;
 * a helper defined in another file is not seen, and the docstring says so).
 */
function inlineHelpers(src: string, body: string): string {
  let out = body;
  const seen = new Set<string>();
  for (const m of body.matchAll(/\b([a-z]\w*)\s*\(\s*\)/g)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const decl = new RegExp(`^([ \\t]*)(?:const|let|function|async function)\\s+${name}\\b`, "m").exec(src);
    if (!decl) continue;
    const start = decl.index;
    const indent = decl[1];
    const rest = src.slice(start + decl[0].length);
    const end = new RegExp(`\\n${indent}(?:const|let|function|async function|return|(?:React\\.)?use[A-Z])\\b`).exec(rest);
    out += "\n" + (end ? rest.slice(0, end.index) : rest.slice(0, 4000));
  }
  return out;
}

/** Offending hook bodies in one source text: `<first fetch name>` per hit. */
export function scanSource(src: string): number {
  return scanNamed(src).length;
}

function scanNamed(src: string): string[] {
  const hits: string[] = [];
  const names = unstableNamesIn(src);
  const unstable = new RegExp(`(?<![\\w.])(${names.join("|")})(?![\\w.(])`);
  // A deps array closing a hook call: `}, [t])` for a braced body, `, [t])` for
  // `useEffect(load, [t])` / `useEffect(() => load(), [t])`.
  for (const m of src.matchAll(/(?:\}|\))\s*,\s*\[([^\]]*)\]\s*\)|\b(?:React\.)?use(?:Effect|LayoutEffect|Callback)\(\s*(\w+)\s*,\s*\[([^\]]*)\]\s*\)/g)) {
    const deps = m[1] ?? m[3] ?? "";
    if (!unstable.test(deps)) continue;
    // Include the matched text: for `useEffect(load, [t])` the hook keyword is IN the match.
    const lines = src.slice(0, (m.index ?? 0) + m[0].length).split("\n");
    let i = lines.length - 1;
    while (i >= 0 && lines.length - i < 160 && !HOOK.test(lines[i])) i--;
    if (i < 0 || !HOOK.test(lines[i])) continue;
    const rawBody = lines.slice(i).join("\n") + (m[2] ? `\n${m[2]}()` : "");
    const body = inlineHelpers(src, rawBody);
    const fetched = [...body.matchAll(FETCH)].map((f) => f[1]);
    if (fetched.length === 0 || !SETTER.test(body)) continue;
    // A callback is only a risk if an EFFECT runs it when its identity changes
    // (`useEffect(() => { void refresh(); }, [refresh])`). A submit handler that is
    // merely re-created is not a load.
    if (/useCallback/.test(lines[i]) && !m[2]) {
      const name = /const\s+(\w+)\s*=/.exec(lines[i])?.[1];
      const runByEffect = name && new RegExp(`\\},\\s*\\[[^\\]]*\\b${name}\\b[^\\]]*\\]\\s*\\)`).test(src);
      if (!runByEffect) continue;
    }
    hits.push(fetched[0]);
  }
  return hits;
}

export function offenders(): string[] {
  const found = new Set<string>();
  for (const root of ROOTS) {
    for (const file of files(join(FRONTEND, root))) {
      const src = readFileSync(file, "utf8");
      for (const hit of scanNamed(src)) found.add(`${relative(FRONTEND, file)} :: ${hit}`);
    }
  }
  return [...found].sort();
}

/** Read one by one for PAD-392: each refetches read-only data; nothing unsaved is replaced. */
const REVIEWED: string[] = [
  // Generated from this guard's own scan (PRINT_OFFENDERS=1), 2026-09-21, then read one by one.
  // iOS verify-email: the effect that runs `send` is fenced by an `autoSent` ref — a re-run sends nothing.
  "apps/mobile/app/verify-email.tsx :: authApi.sendEmailVerificationCode",
  // Admin: a refetch of the pending list and of a setting that PUTs at once — no unsaved state
  // (a refetch racing the PUT can momentarily show the pre-toggle value; it settles).
  "apps/mobile/src/features/settings/admin-section.tsx :: adminApi.listPendingCoaches",
  "apps/web/src/components/settings/AdminSection.tsx :: listPendingCoaches",
  // Club: the re-run is the whole getCoachClub chain → setClub → the [club] effect refetching
  // courts and join requests. Harmless because the editable bits (newCourt, renameValue) are
  // separate state that the refetch does not touch.
  "apps/mobile/src/features/settings/club-section.tsx :: clubsApi.listClubJoinRequests",
  "apps/web/src/components/settings/ClubSection.tsx :: listClubJoinRequests",
  // Read-only lists and statistics.
  "apps/mobile/src/features/settings/import-section.tsx :: getImportHistory",
  "apps/web/src/components/players/detail/AddToClassesDialog.tsx :: getClassInstances",
  "apps/web/src/pages/PresencesPage.tsx :: getCoachPlayers",
  "apps/web/src/pages/PresencesPage.tsx :: getPresenceStats",
  // The validation queue is NOT read-only — it feeds an editor. Harmless because
  // ValidateClassesDialog keeps its edits and extras in its own state keyed by id and
  // never re-derives them from `pending` when the queue refetches.
  "apps/web/src/pages/PresencesPage.tsx :: getPendingValidation",
];

/** The shapes the scan must see — each was a blind spot named in #367's review. */
const MUTANTS: Record<string, string> = {
  "braced body": `
    const { t } = useTranslation();
    useEffect(() => {
      api.getThing().then((d) => setThing(d));
    }, [t]);`,
  "useEffect(load, [t])": `
    const { t } = useTranslation();
    const load = () => api.getThing().then((d) => setThing(d));
    useEffect(load, [t]);`,
  "useEffect(() => load(), [t])": `
    const { t } = useTranslation();
    const load = () => api.getThing().then((d) => setThing(d));
    useEffect(() => load(), [t]);`,
  "void load() body, helper declared outside": `
    const { t } = useTranslation();
    const load = async () => {
      const d = await api.getThing();
      setThing(d);
    };
    useEffect(() => {
      void load();
    }, [t]);`,
  "t destructured under another name": `
    const { t: tr } = useTranslation();
    useEffect(() => {
      api.getThing().then((d) => setThing(d));
    }, [tr]);`,
};

const HARMLESS: Record<string, string> = {
  "a submit handler that is never re-run by an effect": `
    const { t } = useTranslation();
    const send = useCallback(async () => {
      const d = await api.sendThing();
      setSending(d);
    }, [t]);`,
  "a loader with stable deps": `
    const { t } = useTranslation();
    useEffect(() => {
      api.getThing().then((d) => setThing(d));
    }, []);`,
};

describe("the scan sees each shape it exists for (mutants)", () => {
  for (const [name, src] of Object.entries(MUTANTS)) {
    it(`flags: ${name}`, () => {
      expect(scanSource(src), name).toBeGreaterThan(0);
    });
  }
  for (const [name, src] of Object.entries(HARMLESS)) {
    it(`does not flag: ${name}`, () => {
      expect(scanSource(src), name).toBe(0);
    });
  }
});

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
