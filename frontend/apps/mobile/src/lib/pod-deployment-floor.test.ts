import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BEGIN, END, FLOOR, applyPodDeploymentFloor } = require("../../plugins/pod-deployment-floor.js");

/**
 * PAD-467 (mobile.release-build-target rule 3b): Xcode 27 rejects a pod whose deployment target is
 * below 15 (ReachabilitySwift at 12.0 via expo-updates, RNSVG at 12.4); Xcode 26 only warned. The
 * plugin lifts every pod below the app's own minimum (15.1) to it, inside `post_install`. The
 * fixture is the SDK 54 bare template's Podfile (expo-template-bare-minimum 54.0.53), unchanged.
 */
const TEMPLATE = readFileSync(join(__dirname, "__fixtures__", "sdk54-template.Podfile"), "utf8");

describe("pod deployment floor (PAD-467)", () => {
  it("lifts pods below the floor, at the top of post_install, and changes nothing else", () => {
    const out = applyPodDeploymentFloor(TEMPLATE);
    expect(FLOOR).toBe("15.1");
    const lines = out.split("\n");
    const at = lines.findIndex((l) => l.includes("post_install do |installer|"));
    expect(lines[at + 1].trim()).toBe(BEGIN);
    const block = out.slice(out.indexOf(BEGIN), out.indexOf(END) + END.length);
    expect(block).toContain("installer.pods_project.targets.each");
    expect(block).toContain("IPHONEOS_DEPLOYMENT_TARGET");
    expect(block).toContain(`Gem::Version.new('${FLOOR}')`);
    // Removing the block's lines gives back the template byte for byte.
    const first = lines.findIndex((l) => l.includes(BEGIN));
    const last = lines.findIndex((l) => l.includes(END));
    expect([...lines.slice(0, first), ...lines.slice(last + 1)].join("\n")).toBe(TEMPLATE);
  });

  it("is idempotent: a second prebuild adds nothing", () => {
    const once = applyPodDeploymentFloor(TEMPLATE);
    expect(applyPodDeploymentFloor(once)).toBe(once);
    expect(once.split(BEGIN).length - 1).toBe(1);
  });

  it("refuses a Podfile with no post_install rather than silently doing nothing", () => {
    expect(() => applyPodDeploymentFloor("platform :ios, '15.1'\n")).toThrow(/post_install/);
  });
});
