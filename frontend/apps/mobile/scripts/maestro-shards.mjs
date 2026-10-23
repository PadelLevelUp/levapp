/**
 * The nightly Android lane's shard planner (PAD-710, `delivery.android-nightly-lane`).
 *
 * Pure functions over the text of `.maestro/config.yaml`, the shard file
 * `.maestro/android-shards.json` and the flow files' text, plus a small CLI:
 *
 *   node scripts/maestro-shards.mjs check                 # rule 3; exits 1 naming the problem
 *   node scripts/maestro-shards.mjs matrix [--full] [--changed]  # the job list as JSON, for the workflow
 *   node scripts/maestro-shards.mjs changed --json <list> # rule 1b: a PR's runnable changed flows
 *   node scripts/maestro-shards.mjs config <k> <out.yaml> # workspace config for shard k (1-based), or
 *                                                         # "changed" (names in MAESTRO_CHANGED_FLOWS)
 *   node scripts/maestro-shards.mjs watch <pid> <testsDir> <stopFile> <flowLimitMin> <shardBudgetMin>
 *   node scripts/maestro-shards.mjs report <artifactsDir>  # rule 7: the Android lane check, as JSON
 *                                     (env LANE_SHARDS, LANE_EXPERIMENTAL, LANE_RECENT_GREENS)
 *   node scripts/maestro-shards.mjs setup-error < job.log  # PAD-757: a Maestro job's first setup error line
 *                                                         # rule 4: stop Maestro, naming the flow
 *
 * No YAML library: config.yaml's flowsOrder is a flat list under `  flowsOrder:`,
 * and the shard config this writes is just as flat.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Tags whose flows never run on the Android lane (ci-android-maestro.sh passes the same). */
export const EXCLUDED_TAGS = ["ios-only", "open-defect-probe"];

/** The `flowsOrder` names of a Maestro workspace config, in order. */
export function parseFlowsOrder(configText) {
  const lines = configText.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === "  flowsOrder:");
  if (start < 0) throw new Error("config.yaml has no executionOrder.flowsOrder");
  const names = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const m = line.match(/^ {4}- (\S+)\s*$/);
    if (!m) break;
    names.push(m[1]);
  }
  return names;
}

/** Whether a flow file's header carries one of the excluded tags. */
export function isExcluded(flowText) {
  return EXCLUDED_TAGS.some((tag) => new RegExp(`^\\s*-\\s*${tag}\\s*$`, "m").test(flowText));
}

/**
 * The runnable suite in run order: flowsOrder, then any flow file it does not
 * list (Maestro still runs those under `flows/*`), by name; tagged flows removed.
 * @param {string[]} order   flowsOrder names
 * @param {Record<string, string>} flows  flow name -> file text, for every flows/*.yaml
 */
export function runnableSuite(order, flows) {
  const unlisted = Object.keys(flows).filter((n) => !order.includes(n)).sort();
  return [...order, ...unlisted].filter((n) => n in flows && !isExcluded(flows[n]));
}

/** Contiguous slices of the suite at each `starts` entry. */
export function planShards(suite, starts) {
  const idx = starts.map((s) => suite.indexOf(s));
  return idx.map((from, k) => suite.slice(from, k + 1 < idx.length ? idx[k + 1] : suite.length));
}

/** Rule 3: every problem with the shard file, as human-readable lines. Empty = sound. */
export function checkShards(suite, shardFile, flows) {
  const problems = [];
  const { starts, chains = [] } = shardFile;
  if (starts[0] !== suite[0]) problems.push(`starts[0] must be the suite's first flow ${suite[0]}, not ${starts[0]}`);
  for (const s of starts) if (!suite.includes(s)) problems.push(`start ${s} is not a runnable flow`);
  if (problems.length) return problems;
  const positions = starts.map((s) => suite.indexOf(s));
  for (let k = 1; k < positions.length; k++) {
    if (positions[k] <= positions[k - 1]) problems.push(`start ${starts[k]} is not after ${starts[k - 1]} in the suite order`);
  }
  if (problems.length) return problems;
  const shards = planShards(suite, starts);
  const seen = new Map();
  shards.forEach((shard, k) => shard.forEach((n) => seen.set(n, [...(seen.get(n) ?? []), k + 1])));
  for (const n of suite) {
    const in_ = seen.get(n) ?? [];
    if (in_.length !== 1) problems.push(`flow ${n} is in ${in_.length ? `shards ${in_.join(", ")}` : "no shard"}`);
  }
  for (const [n, text] of Object.entries(flows)) {
    if (isExcluded(text) && seen.has(n)) problems.push(`tagged flow ${n} is in shard ${seen.get(n).join(", ")}`);
  }
  for (const chain of chains) {
    const label = chain.join(" → ");
    const missing = chain.filter((n) => !suite.includes(n));
    if (missing.length) {
      problems.push(`chain ${label} names ${missing.join(", ")}, not runnable`);
      continue;
    }
    const where = chain.map((n) => seen.get(n)[0]);
    if (new Set(where).size > 1) problems.push(`chain ${label} is split across shards ${[...new Set(where)].join(", ")}`);
    const at = chain.map((n) => suite.indexOf(n));
    if (at.some((p, i) => i > 0 && p <= at[i - 1])) problems.push(`chain ${label} is out of order in flowsOrder`);
  }
  return problems;
}

/** The flows shard k (1-based) runs: its slice, led by the warm-up from shard 2 on. Shard
 * "changed" (rule 1b) runs the given names, led by the warm-up too. */
export function shardFlows(suite, shardFile, k, changed = []) {
  const slice = k === "changed" ? changed : planShards(suite, shardFile.starts)[k - 1];
  if (!slice) throw new Error(`no shard ${k}; there are ${shardFile.starts.length}`);
  const { warmup } = shardFile;
  return k !== 1 && warmup && !slice.includes(warmup) ? [warmup, ...slice] : slice;
}

/** Rule 1b: the runnable flows among a PR's changed paths, in suite order. */
export function changedFlows(suite, paths) {
  const names = new Set(
    paths.map((p) => p.match(/(?:^|\/)\.maestro\/flows\/([^/]+)\.yaml$/)?.[1]).filter(Boolean)
  );
  return suite.filter((n) => names.has(n));
}

/** Rule 1: the job list — the shards for a full run, else the single "all" job — plus "changed" (rule 1b). */
export function shardMatrix(shardFile, { full, changed }) {
  const jobs = full ? shardFile.starts.map((_, i) => String(i + 1)) : ["all"];
  return changed ? [...jobs, "changed"] : jobs;
}

/** A Maestro workspace config that runs exactly `names`, in that order. */
export function shardConfig(names) {
  return [
    "# Generated by scripts/maestro-shards.mjs (PAD-710). Do not commit.",
    "flows:",
    ...names.map((n) => `  - "flows/${n}.yaml"`),
    "excludeTags:",
    ...EXCLUDED_TAGS.map((t) => `  - ${t}`),
    "executionOrder:",
    "  continueOnFailure: true",
    "  flowsOrder:",
    ...names.map((n) => `    - ${n}`),
    "",
  ].join("\n");
}

/** The flow maestro.log says is running: its last `Running flow <name>` line, or null. */
export function currentFlow(logText) {
  const all = [...logText.matchAll(/Running flow (\S+)/g)];
  return all.length ? all[all.length - 1][1] : null;
}

/**
 * One watchdog tick (rule 4). The clock is the watchdog's own (maestro.log times carry no date):
 * a flow's time starts when the watchdog first sees its name. Returns the next state and, when
 * the flow or the shard is over its limit, the `::error` line to print before stopping Maestro.
 * @param {{ startedAt: number, flow: string | null, flowSince: number } | null} state
 * @param {string | null} flow   the flow running now
 * @param {number} now           ms
 * @param {{ flowLimitMs: number, shardBudgetMs: number }} limits
 */
export function watchdogStep(state, flow, now, limits) {
  const s = state ?? { startedAt: now, flow: null, flowSince: now };
  const next = flow === s.flow ? s : { ...s, flow, flowSince: now };
  const min = (ms) => Math.round(ms / 60_000);
  let stop = null;
  if (next.flow && now - next.flowSince > limits.flowLimitMs) {
    stop = `::error title=Maestro flow over its limit::${next.flow} ran longer than ${min(limits.flowLimitMs)} min; Maestro was stopped`;
  } else if (now - next.startedAt > limits.shardBudgetMs) {
    stop = `::error title=Maestro shard over its budget::${next.flow ?? "(no flow started)"} was running when the shard passed ${min(limits.shardBudgetMs)} min; Maestro was stopped`;
  }
  return { state: next, stop };
}

/** The newest maestro.log under Maestro's tests directory, or null. */
function newestMaestroLog(testsDir) {
  if (!fs.existsSync(testsDir)) return null;
  const logs = fs
    .readdirSync(testsDir)
    .map((d) => path.join(testsDir, d, "maestro.log"))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ f, t: fs.statSync(f).mtimeMs }));
  return logs.length ? logs.sort((a, b) => b.t - a.t)[0].f : null;
}

/** Watch one Maestro process; on a verdict print it, write it to `stopFile`, and stop the process. */
function watch(pid, testsDir, stopFile, flowLimitMin, shardBudgetMin) {
  const limits = { flowLimitMs: flowLimitMin * 60_000, shardBudgetMs: shardBudgetMin * 60_000 };
  let state = null;
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const tick = () => {
    if (!alive()) return;
    const log = newestMaestroLog(testsDir);
    const step = watchdogStep(state, log ? currentFlow(fs.readFileSync(log, "utf8")) : null, Date.now(), limits);
    state = step.state;
    if (step.stop) {
      console.log(step.stop);
      fs.writeFileSync(stopFile, `${step.stop}\n`);
      process.kill(pid, "SIGTERM");
      setTimeout(() => alive() && process.kill(pid, "SIGKILL"), 20_000).unref();
      return;
    }
    setTimeout(tick, 15_000);
  };
  tick();
}

/**
 * Rule 7: each expected shard's result, from the artifacts the lane uploaded
 * (`<dir>/maestro-results-<shard>/tests/{shard-verdict.txt,maestro-stdout.txt}`).
 */
export function readShardResults(dir, shards) {
  return shards.map((shard) => {
    const shardDir = path.join(dir, `maestro-results-${shard}`);
    const tests = path.join(shardDir, "tests");
    const verdictFile = path.join(tests, "shard-verdict.txt");
    // PAD-757: lane-result writes setup-error.txt for a shard whose artifact has no junit report.
    const setupFile = path.join(shardDir, "setup-error.txt");
    const setup = fs.existsSync(setupFile) ? fs.readFileSync(setupFile, "utf8").trim() : "";
    if (!fs.existsSync(verdictFile)) return { shard, missing: true, setup, rc: null, expected: null, finished: null, stop: "", failed: [] };
    const kv = Object.fromEntries(
      fs.readFileSync(verdictFile, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
    );
    const num = (v) => (v === undefined || v === "" ? null : Number(v));
    const stdoutFile = path.join(tests, "maestro-stdout.txt");
    const stdout = fs.existsSync(stdoutFile) ? fs.readFileSync(stdoutFile, "utf8") : "";
    const failed = [...stdout.matchAll(/\[Failed\] (\S+) \([^)]*\)(?: \((.*)\))?\s*$/gm)].map((m) => ({ flow: m[1], reason: m[2] ?? "" }));
    return { shard, missing: false, setup, rc: num(kv.rc), expected: num(kv.expected), finished: num(kv.finished), stop: kv.stop ?? "", failed };
  });
}

/**
 * PAD-757: a shard where no flow ran — no verdict in its artifact, or zero flows finished. (A
 * missing junit alone is not enough: a watchdog stop can leave none after flows did run.)
 */
export function noFlowRan(r) {
  return r.missing || r.finished === 0;
}

/**
 * PAD-757: the first error line of the emulator step in a Maestro job's log (the GitHub job-log
 * text), or of the whole job when that step never started; "" when there is none.
 */
export function setupError(jobLog) {
  const lines = jobLog.split("\n").map((l) => l.replace(/^\S*\d{4}-\d\d-\d\dT[\d:.]+Z /, "").trim());
  const start = lines.findLastIndex((l) => /^##\[group\]Run reactivecircus\/android-emulator-runner/.test(l));
  const hit = lines
    .slice(start + 1)
    .find((l) => l && !l.startsWith("[command]") && !l.startsWith("##[group]") && /\berror\b|\bfailed\b/i.test(l));
  return (hit ?? "").replace(/^##\[error\]/, "").slice(0, 300);
}

/**
 * Rule 7: the Android lane check — success, neutral while experimental, failure once strict.
 * PAD-757: a shard where no flow ran is a setup failure: always neutral, never success.
 */
export function laneVerdict(results, { experimental, recentGreens }) {
  const lines = [];
  const setupFailures = [];
  for (const r of results) {
    if (noFlowRan(r)) {
      const error = r.setup || (r.missing ? "no verdict in its artifact: cancelled, or failed before Maestro" : "Maestro finished no flow");
      setupFailures.push({ shard: r.shard, error });
      lines.push(`- **shard ${r.shard}: setup failed, no flow ran** — ${error}`);
      continue;
    }
    for (const f of r.failed) lines.push(`- shard ${r.shard}: **${f.flow}** — ${f.reason || "failed"}`);
    if (r.stop) lines.push(`- shard ${r.shard}: ${r.stop.replace(/^::error title=([^:]*)::/, "**$1:** ")}`);
    if (r.expected !== null && r.finished !== null && r.finished !== r.expected) {
      lines.push(`- shard ${r.shard}: reported ${r.finished} of ${r.expected} flows`);
    }
    if (r.rc && !r.failed.length && !r.stop && r.finished === r.expected) lines.push(`- shard ${r.shard}: Maestro exited ${r.rc}`);
  }
  const strict = !experimental || recentGreens >= 2;
  const red = lines.length > 0;
  const flowRed = lines.length > setupFailures.length;
  const conclusion = !red ? "success" : flowRed && strict ? "failure" : "neutral";
  const flows = results.reduce((n, r) => n + (r.failed?.length ?? 0), 0);
  const parts = [];
  if (setupFailures.length) parts.push(`setup failed in ${setupFailures.length} job(s), no flow ran`);
  if (flowRed) parts.push(`${flows} flow(s) red`);
  const title = !red
    ? `All flows passed in ${results.length} job(s)`
    : `${parts.join("; ")}${conclusion === "neutral" ? (flowRed ? " — experimental lane, reported as neutral" : " — reported as neutral") : ""}`;
  const mode = strict
    ? experimental
      ? "Strict: the two previous scheduled runs on main were green."
      : "Strict: the lane is no longer experimental."
    : `Experimental (ANDROID_LANE_EXPERIMENTAL): a red is neutral until two consecutive scheduled greens on main (${recentGreens}/2).`;
  return { conclusion, title, summary: [mode, "", ...(red ? lines : ["Every flow passed."])].join("\n"), strict, setupFailures };
}

/** Read the committed workspace: suite order, shard file and flow texts. */
export function readWorkspace(maestroDir) {
  const order = parseFlowsOrder(fs.readFileSync(path.join(maestroDir, "config.yaml"), "utf8"));
  const shardFile = JSON.parse(fs.readFileSync(path.join(maestroDir, "android-shards.json"), "utf8"));
  const flows = {};
  for (const f of fs.readdirSync(path.join(maestroDir, "flows"))) {
    if (f.endsWith(".yaml")) flows[f.slice(0, -5)] = fs.readFileSync(path.join(maestroDir, "flows", f), "utf8");
  }
  return { order, shardFile, flows, suite: runnableSuite(order, flows) };
}

function main(argv) {
  const [cmd, k, out] = argv;
  if (cmd === "report") {
    const shards = JSON.parse(process.env.LANE_SHARDS || "[]");
    const verdict = laneVerdict(readShardResults(argv[1], shards), {
      experimental: process.env.LANE_EXPERIMENTAL === "true",
      recentGreens: Number(process.env.LANE_RECENT_GREENS || 0),
    });
    return console.log(JSON.stringify(verdict));
  }
  if (cmd === "setup-error") {
    return console.log(setupError(fs.readFileSync(0, "utf8")));
  }
  if (cmd === "watch") {
    const [, pid, testsDir, stopFile, flowLimit, shardBudget] = argv;
    return watch(Number(pid), testsDir, stopFile, Number(flowLimit), Number(shardBudget));
  }
  const maestroDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".maestro");
  const { shardFile, flows, suite } = readWorkspace(maestroDir);
  const problems = checkShards(suite, shardFile, flows);
  if (cmd === "check" || problems.length) {
    for (const p of problems) console.error(`android-shards: ${p}`);
    if (problems.length) process.exit(1);
    planShards(suite, shardFile.starts).forEach((s, i) => console.log(`shard ${i + 1}: ${s.length} flows, ${s[0]} .. ${s.at(-1)}`));
    if (cmd === "check") return;
  }
  if (cmd === "matrix") {
    return console.log(JSON.stringify(shardMatrix(shardFile, { full: argv.includes("--full"), changed: argv.includes("--changed") })));
  }
  if (cmd === "changed") {
    // The workflow passes paths-filter's JSON list; nothing here goes through a shell.
    const paths = argv[1] === "--json" ? JSON.parse(argv[2] || "[]") : argv.slice(1);
    return console.log(changedFlows(suite, paths).join(" "));
  }
  if (cmd === "config") {
    const changed = (process.env.MAESTRO_CHANGED_FLOWS ?? "").split(/\s+/).filter(Boolean);
    if (k === "changed" && !changed.length) {
      console.error("android-shards: config changed needs MAESTRO_CHANGED_FLOWS");
      process.exit(2);
    }
    const names = shardFlows(suite, shardFile, k === "changed" ? "changed" : Number(k), changedFlows(suite, changed.map((n) => `.maestro/flows/${n}.yaml`)));
    fs.writeFileSync(out, shardConfig(names));
    console.log(`shard ${k}: ${names.length} flows -> ${out}`);
    return;
  }
  console.error("usage: maestro-shards.mjs check | matrix [--full] [--changed] | changed --json <list> | report <dir> | config <k> <out.yaml> | watch <pid> <testsDir> <stopFile> <flowLimitMin> <shardBudgetMin>");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
