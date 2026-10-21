import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkShards,
  currentFlow,
  parseFlowsOrder,
  planShards,
  readWorkspace,
  runnableSuite,
  shardConfig,
  shardFlows,
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
