import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
 * Playwright's files (apps/web/e2e) are Playwright's to list, not vitest's; the
 * second test only pins that nothing named like a vitest test hides in there.
 */
const FRONTEND = join(__dirname, "..", "..", "..");

const RUNNERS: { name: string; cwd: string; args: string[] }[] = [
  { name: "packages", cwd: FRONTEND, args: ["--config", "vitest.packages.config.ts"] },
  { name: "web", cwd: join(FRONTEND, "apps", "web"), args: [] },
  { name: "mobile", cwd: join(FRONTEND, "apps", "mobile"), args: [] },
];

/** Looks like a test to a human: `x.test.ts`, `x.spec.tsx`, `x.test.mjs`, or anything under `__tests__/`. */
const LOOKS_LIKE_A_TEST = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)__tests__\//;
const PLAYWRIGHT_DIR = "apps/web/e2e/";

function vitestEntry(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
}

/** What this runner would run, from the runner itself. Paths relative to frontend/. */
function collectedBy(runner: (typeof RUNNERS)[number]): string[] {
  // A child vitest must not think it is a worker of this one.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST")));
  const out = execFileSync(process.execPath, [vitestEntry(), "list", "--filesOnly", "--json", ...runner.args], {
    cwd: runner.cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = JSON.parse(out.slice(out.indexOf("["))) as { file: string }[];
  return files.map(({ file }) => file.slice(FRONTEND.length + 1).split("\\").join("/"));
}

/** Every file git knows or would add (tracked + untracked, minus ignored), relative to frontend/. */
function filesOnDisk(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "."], {
    cwd: FRONTEND,
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

    const candidates = filesOnDisk().filter((f) => LOOKS_LIKE_A_TEST.test(f) && !f.startsWith(PLAYWRIGHT_DIR));
    expect(candidates.length).toBeGreaterThan(0);

    const orphans = candidates.filter((f) => !collected.has(f));
    expect(orphans, "collected by no vitest config — widen an include or move the file").toEqual([]);

    // The other direction: a file two configs both run is a test that runs twice.
    const twice = [...collected].filter(([, by]) => by.length > 1).map(([f, by]) => `${f} (${by.join(", ")})`);
    expect(twice, "collected by more than one vitest config").toEqual([]);
  }, 180_000);

  it("nothing under the Playwright folder is named for a runner Playwright is not", () => {
    // Playwright's default testMatch takes `.test.` and `.spec.` with js/ts/mjs only.
    const strays = filesOnDisk().filter(
      (f) => f.startsWith(PLAYWRIGHT_DIR) && LOOKS_LIKE_A_TEST.test(f) && !/\.(test|spec)\.(js|ts|mjs)$/.test(f)
    );
    expect(strays, "test-named files under e2e/ that Playwright's testMatch would skip").toEqual([]);
  });
});
