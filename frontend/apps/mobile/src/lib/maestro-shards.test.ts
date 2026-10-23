import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  changedFlows,
  checkShards,
  laneVerdict,
  readShardResults,
  setupError,
  currentFlow,
  parseFlowsOrder,
  planShards,
  readWorkspace,
  runnableSuite,
  shardConfig,
  shardFlows,
  shardMatrix,
  watchdogStep,
} from "../../scripts/maestro-shards.mjs";

/**
 * PAD-710 (`delivery.android-nightly-lane`): the nightly Android suite runs as parallel shards
 * cut by flow name, and a flow that overruns is stopped and named instead of the job being
 * cancelled at its cap.
 */

const MAESTRO_DIR = path.resolve(__dirname, "../../.maestro");
const TAGGED = ["47-push-tap-routing", "122-warm-push-tap-shows-the-message", "85-working-hours-invalid-day", "92-working-hours-minute-grid"];

describe("the committed shard file (rule 3)", () => {
  const { shardFile, flows, suite } = readWorkspace(MAESTRO_DIR);

  it("found the suite and the shard file it checks (R-032)", () => {
    expect(suite.length).toBeGreaterThan(100);
    expect(shardFile.starts.length).toBe(4);
  });

  it("passes the check", () => {
    expect(checkShards(suite, shardFile, flows)).toEqual([]);
  });

  it("puts every runnable flow in exactly one shard", () => {
    const shards = planShards(suite, shardFile.starts);
    expect(shards.flat()).toEqual(suite);
    expect(new Set(shards.flat()).size).toBe(suite.length);
  });

  it("runs the flow config.yaml does not list, and none of the tagged ones", () => {
    const shards = planShards(suite, shardFile.starts);
    expect(shards.at(-1)).toContain("36-android-evidence");
    for (const name of TAGGED) {
      expect(Object.keys(flows)).toContain(name);
      expect(shards.flat()).not.toContain(name);
    }
  });
});

describe("checkShards", () => {
  const flows = Object.fromEntries(
    ["01-login", "03-class-management", "04-attendance", "05-class-deletion", "14-student-calendar", "47-push"].map((n) => [
      n,
      n === "47-push" ? "tags:\n  - ios-only\n---\n" : "appId: x\n---\n",
    ])
  );
  const suite = runnableSuite(["01-login", "03-class-management", "04-attendance", "05-class-deletion", "14-student-calendar", "47-push"], flows);
  const chains = [["03-class-management", "05-class-deletion"]];

  it("drops the tagged flow from the suite", () => {
    expect(suite).not.toContain("47-push");
  });

  it("refuses a split chain by name", () => {
    const problems = checkShards(suite, { starts: ["01-login", "04-attendance"], chains }, flows);
    expect(problems).toEqual(["chain 03-class-management → 05-class-deletion is split across shards 1, 2"]);
  });

  it("refuses a start that is not a runnable flow", () => {
    expect(checkShards(suite, { starts: ["01-login", "47-push"], chains }, flows)).toEqual(["start 47-push is not a runnable flow"]);
  });

  it("accepts a cut that keeps the chain whole", () => {
    expect(checkShards(suite, { starts: ["01-login", "14-student-calendar"], chains }, flows)).toEqual([]);
  });
});

describe("a shard's workspace config", () => {
  const suite = ["01-login", "02-a", "03-b", "04-c", "05-d"];
  const shardFile = { warmup: "01-login", starts: ["01-login", "03-b", "05-d"] };

  it("leads shards after the first with the warm-up, then its own flows in order", () => {
    expect(shardFlows(suite, shardFile, 1)).toEqual(["01-login", "02-a"]);
    expect(shardFlows(suite, shardFile, 2)).toEqual(["01-login", "03-b", "04-c"]);
    expect(shardFlows(suite, shardFile, 3)).toEqual(["01-login", "05-d"]);
  });

  it("lists exactly those files and the same flowsOrder, continuing on failure", () => {
    const text = shardConfig(["01-login", "03-b"]);
    expect(text).toContain('flows:\n  - "flows/01-login.yaml"\n  - "flows/03-b.yaml"\nexcludeTags:');
    expect(text).toContain("continueOnFailure: true");
    expect(parseFlowsOrder(text)).toEqual(["01-login", "03-b"]);
  });
});

describe("the watchdog (rule 4)", () => {
  // Lines from a real Maestro 2.6.1 maestro.log (nightly run 39568851531, 2026-10-21).
  const LOG =
    "10:16:14.004 [ INFO] maestro.cli.runner.TestSuiteInteractor.runFlow:  Running flow 54-settings-build-info\n" +
    "10:17:23.214 [ INFO] maestro.cli.runner.TestSuiteInteractor.runFlow:  Running flow 61-availability-two-cards\n" +
    "10:18:12.677 [ INFO] maestro.Maestro.hierarchyBasedTap-ogj28Uc: Tapping at (945, 2267)\n";
  const limits = { flowLimitMs: 12 * 60_000, shardBudgetMs: 75 * 60_000 };
  const MIN = 60_000;

  it("reads the flow that is running from maestro.log", () => {
    expect(currentFlow(LOG)).toBe("61-availability-two-cards");
    expect(currentFlow("no flow yet\n")).toBeNull();
  });

  it("keeps going while the flow is inside its limit", () => {
    let s = watchdogStep(null, "61-availability-two-cards", 0, limits);
    s = watchdogStep(s.state, "61-availability-two-cards", 11 * MIN, limits);
    expect(s.stop).toBeNull();
  });

  it("stops and names a flow over its limit", () => {
    let s = watchdogStep(null, "61-availability-two-cards", 0, limits);
    s = watchdogStep(s.state, "61-availability-two-cards", 12 * MIN + 1, limits);
    expect(s.stop).toMatch(/^::error title=Maestro flow over its limit::61-availability-two-cards /);
  });

  it("restarts the clock when the next flow begins", () => {
    let s = watchdogStep(null, "54-settings-build-info", 0, limits);
    s = watchdogStep(s.state, "61-availability-two-cards", 10 * MIN, limits);
    s = watchdogStep(s.state, "61-availability-two-cards", 21 * MIN, limits);
    expect(s.stop).toBeNull();
  });

  it("stops and names the running flow when the shard is over its budget", () => {
    let s = watchdogStep(null, null, 0, limits);
    for (let t = 5; t <= 70; t += 5) s = watchdogStep(s.state, `flow-${t}`, t * MIN, limits);
    s = watchdogStep(s.state, "flow-70", 75 * MIN + 1, limits);
    expect(s.stop).toMatch(/^::error title=Maestro shard over its budget::flow-70 /);
  });
});

describe("a pull request's changed flows (rule 1b)", () => {
  const { shardFile, suite } = readWorkspace(MAESTRO_DIR);
  const F = "frontend/apps/mobile/.maestro/flows/";

  it("keeps the runnable ones, in suite order, and drops tagged, deleted and subflow paths", () => {
    const names = changedFlows(suite, [
      `${F}47-push-tap-routing.yaml`,
      `${F}99-gone.yaml`,
      `${F}27-unknown-sender-block.yaml`,
      `${F}03-class-management.yaml`,
      "frontend/apps/mobile/.maestro/subflows/login.yaml",
    ]);
    expect(names).toEqual(["03-class-management", "27-unknown-sender-block"]);
  });

  it("runs them led by the warm-up, like a shard", () => {
    expect(shardFlows(suite, shardFile, "changed", ["27-unknown-sender-block"])).toEqual(["01-login", "27-unknown-sender-block"]);
    expect(shardFlows(suite, shardFile, "changed", ["01-login", "27-unknown-sender-block"])).toEqual(["01-login", "27-unknown-sender-block"]);
  });

  it("adds the changed job to whichever matrix the run has", () => {
    expect(shardMatrix(shardFile, { full: false, changed: true })).toEqual(["all", "changed"]);
    expect(shardMatrix(shardFile, { full: true, changed: true })).toEqual(["1", "2", "3", "4", "changed"]);
    expect(shardMatrix(shardFile, { full: false, changed: false })).toEqual(["all"]);
  });
});

describe("the Android lane check (rule 7, PAD-720)", () => {
  const green = { shard: "1", missing: false, rc: 0, expected: 36, finished: 36, stop: "", failed: [] };
  const red = {
    shard: "2",
    missing: false,
    rc: 1,
    expected: 32,
    finished: 32,
    stop: "",
    failed: [{ flow: "27-unknown-sender-block", reason: "Element not found: chat-back" }],
  };
  const gone = { shard: "3", missing: true, rc: null, expected: null, finished: null, stop: "", failed: [] };

  it("is neutral while experimental, naming the red flows and the silent shard", () => {
    const v = laneVerdict([green, red, gone], { experimental: true, recentGreens: 0 });
    expect(v.conclusion).toBe("neutral");
    expect(v.summary).toContain("27-unknown-sender-block");
    expect(v.summary).toContain("Element not found: chat-back");
    expect(v.summary).toContain("shard 3: setup failed, no flow ran");
    expect(v.title).toBe("setup failed in 1 job(s), no flow ran; 1 flow(s) red — experimental lane, reported as neutral");
  });

  it("fails once strict: flag removed, or two scheduled greens on main", () => {
    expect(laneVerdict([green, red], { experimental: false, recentGreens: 0 }).conclusion).toBe("failure");
    expect(laneVerdict([green, red], { experimental: true, recentGreens: 2 }).conclusion).toBe("failure");
  });

  it("is a success when every flow passed, whatever the flag", () => {
    expect(laneVerdict([green], { experimental: true, recentGreens: 0 }).conclusion).toBe("success");
  });

  it("counts a watchdog stop and a short count as red", () => {
    const stopped = { ...green, rc: 1, finished: 20, stop: "::error title=Maestro flow over its limit::61-x ran longer than 12 min" };
    const v = laneVerdict([stopped], { experimental: true, recentGreens: 0 });
    expect(v.conclusion).toBe("neutral");
    expect(v.summary).toContain("61-x ran longer than 12 min");
    expect(v.summary).toContain("reported 20 of 36 flows");
  });

  // PAD-757: run 40021910967 (#847) — the emulator's SDK install failed, no flow ran, the artifact held
  // only flask.log, and the check read "0 flow(s) red".
  it("reports a shard where no flow ran as a named setup failure: neutral even when strict, never success", () => {
    const sdk = { ...gone, shard: "all", setup: "Warning: An error occurred while preparing SDK package Android Emulator" };
    const empty = { ...green, shard: "all", rc: 1, expected: null, finished: 0 };
    for (const opts of [
      { experimental: true, recentGreens: 0 },
      { experimental: false, recentGreens: 0 },
    ]) {
      const v = laneVerdict([sdk], opts);
      expect(v.conclusion).toBe("neutral");
      expect(v.title).toBe("setup failed in 1 job(s), no flow ran — reported as neutral");
      expect(v.title).not.toContain("0 flow(s) red");
      expect(v.summary).toContain("preparing SDK package Android Emulator");
      expect(v.setupFailures).toEqual([{ shard: "all", error: sdk.setup }]);
      expect(laneVerdict([empty], opts).conclusion).toBe("neutral");
      expect(laneVerdict([empty], opts).summary).toContain("Maestro finished no flow");
    }
  });

  it("keeps a strict flow failure a failure next to a setup failure", () => {
    expect(laneVerdict([red, gone], { experimental: false, recentGreens: 0 }).conclusion).toBe("failure");
  });

  it("reads the emulator step's first error line from a job log", () => {
    const log = [
      "2026-10-23T21:01:34.8664752Z ##[error]Flask did not answer on :5001",
      "2026-10-23T21:02:09.9253383Z ##[group]Run reactivecircus/android-emulator-runner@v2",
      "2026-10-23T21:02:16.0849493Z [command]/usr/bin/sh -c \\sdkmanager --install emulator --channel=0 > /dev/null",
      "2026-10-23T21:02:26.9391293Z Warning: An error occurred while preparing SDK package Android Emulator: Error on ZipFile unknown archive.",
      "2026-10-23T21:02:27.7338766Z error: could not connect to TCP port 5554: Connection refused",
    ].join("\n");
    expect(setupError(log)).toBe(
      "Warning: An error occurred while preparing SDK package Android Emulator: Error on ZipFile unknown archive."
    );
    expect(setupError("2026-10-23T21:01:34.8664752Z ##[error]Flask did not answer on :5001")).toBe("Flask did not answer on :5001");
    expect(setupError("all fine\n")).toBe("");
    expect(setupError("2026-10-23T21:51:40.3878955Z \x1b[33mWarning: Failed to find package 'platforms;android-99'\x1b[0m")).toBe(
      "Warning: Failed to find package 'platforms;android-99'"
    );
  });

  it("reads each shard's artifact, and marks an expected shard with no artifact as missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lane-"));
    const tests = path.join(dir, "maestro-results-2", "tests");
    fs.mkdirSync(tests, { recursive: true });
    fs.writeFileSync(path.join(tests, "shard-verdict.txt"), "shard=2\nrc=1\nexpected=2\nfinished=2\nstop=\n");
    fs.writeFileSync(
      path.join(tests, "maestro-stdout.txt"),
      "[Passed] 01-login (1m 43s)\n[Failed] 27-unknown-sender-block (1m 36s) (Element not found: chat-back)\n"
    );
    fs.mkdirSync(path.join(dir, "maestro-results-3"));
    fs.writeFileSync(path.join(dir, "maestro-results-3", "setup-error.txt"), "adb: failed to install\n");
    const results = readShardResults(dir, ["2", "3"]);
    expect(results.map((r) => [r.shard, r.missing, r.rc, r.failed, r.setup])).toEqual([
      ["2", false, 1, [{ flow: "27-unknown-sender-block", reason: "Element not found: chat-back" }], ""],
      ["3", true, null, [], "adb: failed to install"],
    ]);
  });
});
