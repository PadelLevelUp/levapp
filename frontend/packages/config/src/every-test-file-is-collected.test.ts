import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B-127 — a test file no runner collects is a test nobody runs.
 *
 * `packages/hooks/src/useCalendarEvents.test.tsx` (PAD-348's regression test for
 * B-113) sat in the repo for five days collected by NO vitest config: packages
 * listed only `*.test.ts`, web only its own `src/`, mobile only its own `src/` and
 * `app/`. B-113 was marked resolved on the strength of a test that had never been
 * executed. It passes — and fails with the fix removed — but nobody knew.
 *
 * One instrument, not two: the "collected" side is NOT a second copy of the
 * include globs. It is what each runner itself says it would run
 * (`vitest list --filesOnly --json` per config). Only the "candidate" side is a
 * pattern, and it is deliberately wider than any runner's: anything that looks
 * like a test by name. Add a runner → add it to RUNNERS; nothing else changes.
 *
 * Playwright is the fourth runner and is asked the same way: `playwright test --list
 * --reporter=json` starts no server and no browser, takes about two seconds, and says
 * which files it would run — so a spec excluded by testDir / testMatch / testIgnore or a
 * project filter shows up here as an orphan. Maestro is covered elsewhere:
 * apps/mobile/src/lib/maestro-flow-numbers.test.ts asserts every flow on disk is in
 * config.yaml's flowsOrder and every listed flow exists.
 */
// Real paths on both sides: on a symlinked checkout (/tmp → /private/tmp, a linked worktree)
// vitest may spell the path differently from __dirname, and every file would look foreign.
const FRONTEND = realpathSync(join(__dirname, "..", "..", ".."));

const RUNNERS: { name: string; cwd: string; args: string[] }[] = [
  { name: "packages", cwd: FRONTEND, args: ["--config", "vitest.packages.config.ts"] },
  { name: "web", cwd: join(FRONTEND, "apps", "web"), args: [] },
  { name: "mobile", cwd: join(FRONTEND, "apps", "mobile"), args: [] },
];

/** Looks like a test to a human: `x.test.ts`, `x.spec.tsx`, `x.test.mjs`, or anything under `__tests__/`. */
const LOOKS_LIKE_A_TEST = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)__tests__\//;
const PLAYWRIGHT_DIR = "apps/web/e2e/";

/**
 * B-173: git's repository variables. A git hook exports GIT_DIR (a worktree's gitdir) and
 * friends; a child git inheriting them ignores its cwd — `git ls-files` from frontend/ listed
 * from the wrong root and every packages test looked orphaned. Every child here drops them.
 */
const GIT_LOCAL_ENV_VARS = new Set(
  execFileSync("git", ["rev-parse", "--local-env-vars"], { cwd: "/", encoding: "utf8", env: { PATH: process.env.PATH } })
    .split("\n")
    .filter(Boolean),
);

/** process.env without VITEST* (a child vitest must not think it is a worker) or git's repo variables. */
function childEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST") && !GIT_LOCAL_ENV_VARS.has(k)),
  );
}

function vitestEntry(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
}

/** What this runner would run, from the runner itself. Paths relative to frontend/. */
function collectedBy(runner: (typeof RUNNERS)[number]): string[] {
  const env = childEnv();
  const out = execFileSync(process.execPath, [vitestEntry(), "list", "--filesOnly", "--json", ...runner.args], {
    cwd: runner.cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = JSON.parse(out.slice(out.indexOf("["))) as { file: string }[];
  return files.map(({ file }) => relative(FRONTEND, realpathSync(file)).split("\\").join("/"));
}

/** What Playwright would run, from Playwright itself. Paths relative to frontend/. */
function collectedByPlaywright(): string[] {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
  const env = childEnv();
  const out = execFileSync(process.execPath, [cli, "test", "--list", "--reporter=json"], {
    cwd: join(FRONTEND, "apps", "web"),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  type Suite = { file?: string; suites?: Suite[]; specs?: { file?: string }[] };
  const report = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: Suite[]; config?: { rootDir?: string } };
  const files = new Set<string>();
  const walk = (suite: Suite) => {
    if (suite.file) files.add(suite.file);
    for (const spec of suite.specs ?? []) if (spec.file) files.add(spec.file);
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  // The report's paths are relative to the config's testDir.
  const testDir = report.config?.rootDir ?? join(FRONTEND, PLAYWRIGHT_DIR);
  return [...files].map((f) => relative(FRONTEND, realpathSync(join(testDir, f))).split("\\").join("/"));
}

/** Every file git knows or would add (tracked + untracked, minus ignored), relative to frontend/. */
function filesOnDisk(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "."], {
    cwd: FRONTEND,
    env: childEnv(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

describe("every test file is collected by a runner (B-127)", () => {
  it("no vitest-looking file is collected by zero vitest configs", () => {
    const collected = new Map<string, string[]>();
    for (const runner of RUNNERS) {
      const files = collectedBy(runner);
      // A runner that lists nothing is a broken instrument, not a clean result.
      expect(files.length, `${runner.name} listed no test files`).toBeGreaterThan(0);
      for (const file of files) collected.set(file, [...(collected.get(file) ?? []), runner.name]);
    }

    const onDisk = filesOnDisk();
    // The instrument reads THIS repository, relative to frontend/. Under an inherited GIT_DIR git took
    // frontend/ for the top and listed the index's repo-root paths ("frontend/packages/…"), so every
    // test looked orphaned (B-173): say that, not "332 orphans".
    expect(onDisk).toContain("packages/config/src/every-test-file-is-collected.test.ts");
    expect(
      onDisk.filter((f) => f.startsWith("frontend/")),
      "git listed paths from the repository root, not frontend/ — is GIT_DIR inherited?",
    ).toEqual([]);
    const candidates = onDisk.filter((f) => LOOKS_LIKE_A_TEST.test(f) && !f.startsWith(PLAYWRIGHT_DIR));
    expect(candidates.length).toBeGreaterThan(0);

    const orphans = candidates.filter((f) => !collected.has(f));
    expect(
      orphans,
      "collected by no vitest config — widen an include, move the file, or delete it if it is a stray (untracked files count)"
    ).toEqual([]);

    // The other direction: a file two configs both run is a test that runs twice.
    const twice = [...collected].filter(([, by]) => by.length > 1).map(([f, by]) => `${f} (${by.join(", ")})`);
    expect(twice, "collected by more than one vitest config").toEqual([]);
  }, 180_000);

  it("no test-looking file under the Playwright folder is left out by Playwright", () => {
    const listed = collectedByPlaywright();
    expect(listed.length, "playwright --list listed no test files").toBeGreaterThan(0);

    const candidates = filesOnDisk().filter((f) => f.startsWith(PLAYWRIGHT_DIR) && LOOKS_LIKE_A_TEST.test(f));
    expect(candidates.length).toBeGreaterThan(0);

    const orphans = candidates.filter((f) => !listed.includes(f));
    expect(
      orphans,
      "under e2e/ and looks like a test, but `playwright test --list` does not list it — check its name against the config's testMatch / testIgnore and the project filters, move it out of e2e/, or delete it if it is a stray"
    ).toEqual([]);
  }, 180_000);
});
