import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * PAD-839 (dashboard.student-setup-guide criteria 2, 5, 10, 11): the setup guide's Maestro flows
 * 337-340 run in the pinned execution order, run before the coach is logged out by
 * 28-password-recovery, name the criterion they prove, and have the scripts and subflow they call.
 */
const MAESTRO = join(__dirname, "..", "..", ".maestro");

const FLOWS: Record<string, string> = {
  "337-setup-guide-first-login": "DASHBOARD-STUDENT-SETUP-GUIDE-2",
  "338-setup-guide-hide": "DASHBOARD-STUDENT-SETUP-GUIDE-5",
  "339-schedule-editor-same": "DASHBOARD-STUDENT-SETUP-GUIDE-10",
  "340-schedule-editor-varies": "DASHBOARD-STUDENT-SETUP-GUIDE-11",
};

function flowsOrder(): string[] {
  const cfg = readFileSync(join(MAESTRO, "config.yaml"), "utf8");
  return (cfg.split("flowsOrder:")[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).replace(/^["']|["']$/g, ""));
}

describe("PAD-839 setup guide flows (337-340)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-2] pins flows 337-340 in flowsOrder, before 28-password-recovery, each naming its criterion", () => {
    const order = flowsOrder();
    const last = order.indexOf("28-password-recovery");
    for (const [flow, criterion] of Object.entries(FLOWS)) {
      const at = order.indexOf(flow);
      expect(at, flow).toBeGreaterThanOrEqual(0);
      expect(at, flow).toBeLessThan(last);
      const body = readFileSync(join(MAESTRO, "flows", `${flow}.yaml`), "utf8");
      expect(body, flow).toContain(criterion);
    }
    for (const helper of [
      "scripts/setup-guide-student-setup.js",
      "scripts/setup-guide-student-teardown.js",
      "subflows/login-guide-student.yaml",
    ]) {
      expect(existsSync(join(MAESTRO, helper)), helper).toBe(true);
    }
  });
});
