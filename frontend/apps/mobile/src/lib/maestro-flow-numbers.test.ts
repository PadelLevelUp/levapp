import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * PAD-300 — the Maestro flow prefixes are hand-numbered identifiers handed
 * out by the coordinator; on 2026-09-11 five prefixes (19, 22, 23, 28, 29)
 * were each used twice by flows that landed from parallel sessions. Two
 * flows with one number break the "flows are named after their files" rule
 * in `.maestro/config.yaml` and make the registry ambiguous. This pins:
 * every numbered flow has a unique prefix, every flow is in the pinned
 * execution order, and `28-password-recovery` runs last (its header says
 * why — it logs the coach out of the recovery link).
 */
const MAESTRO = join(__dirname, "..", "..", ".maestro");

function flowFiles(): string[] {
  return readdirSync(join(MAESTRO, "flows"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort();
}

function flowsOrder(): string[] {
  const cfg = readFileSync(join(MAESTRO, "config.yaml"), "utf8");
  const after = cfg.split("flowsOrder:")[1] ?? "";
  return after
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).replace(/^["']|["']$/g, ""));
}

describe("Maestro flow numbering (PAD-300)", () => {
  it("gives every numbered flow a unique prefix", () => {
    const seen = new Map<string, string[]>();
    for (const f of flowFiles()) {
      const m = /^(\d+)-/.exec(f);
      if (!m) continue;
      seen.set(m[1], [...(seen.get(m[1]) ?? []), f]);
    }
    const dupes = [...seen.entries()].filter(([, names]) => names.length > 1);
    expect(dupes, `duplicate flow prefixes: ${JSON.stringify(dupes)}`).toEqual([]);
  });

  /** Flows that must NOT be in the order, with the reason: 47 runs only from
   *  scripts/push-tap-flow.sh (README "Push-tap"); 36 is the Android-only evidence
   *  flow for the CI emulator lane (PAD-298, README "36-android-evidence"). */
  const RUN_BY_SCRIPT_ONLY = ["47-push-tap-routing", "36-android-evidence"];

  it("lists every flow in config.yaml's execution order, and every listed flow exists", () => {
    const files = flowFiles();
    const order = flowsOrder();
    expect(order.filter((o) => !files.includes(o))).toEqual([]);
    expect(files.filter((f) => !order.includes(f) && !RUN_BY_SCRIPT_ONLY.includes(f))).toEqual([]);
    expect(order.filter((o) => RUN_BY_SCRIPT_ONLY.includes(o))).toEqual([]);
  });

  it("keeps 28-password-recovery last", () => {
    const order = flowsOrder();
    expect(order[order.length - 1]).toBe("28-password-recovery");
  });
});
