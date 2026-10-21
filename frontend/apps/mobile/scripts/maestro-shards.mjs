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
  console.error("usage: maestro-shards.mjs check | matrix [--full] [--changed] | changed --json <list> | config <k> <out.yaml> | watch <pid> <testsDir> <stopFile> <flowLimitMin> <shardBudgetMin>");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
