import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * classes.clone (PAD-524) on iOS. The new-class screen mounts react-query hooks the unit harness
 * cannot, so this reads the source, as `edit-leave-asks.test.ts` does, and pins what would let a
 * prefill bypass create: the screen has ONE save, inside createClassCreateFlow (overlap, then the
 * unavailable-student warning, then save), and a clone uses it; Create waits for a start; the
 * class screen opens the clone with the event's own model, id and date.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const NEW = fs.readFileSync(path.join(MOBILE_ROOT, "app/class/new.tsx"), "utf8");
const DETAIL = fs.readFileSync(path.join(MOBILE_ROOT, "app/class/[id].tsx"), "utf8");

describe("a clone is the ordinary create on iOS (PAD-524)", () => {
  it("has exactly one save, and it is the create flow's", () => {
    expect(NEW.match(/addClass\.mutateAsync\(/g)?.length).toBe(1);
    const flow = NEW.slice(NEW.indexOf("createClassCreateFlow({"));
    expect(flow.indexOf("addClass.mutateAsync(")).toBeGreaterThan(0);
    expect(NEW).toMatch(/await saveFlow\.start\(\)/);
  });

  it("prefills from the server template and leaves the start to the coach", () => {
    expect(NEW).toMatch(/classesApi\.getCloneTemplate\(cloneRef!\)/);
    expect(NEW).toMatch(/setStartTime\(""\);\s*setEndTime\(""\);/);
    expect(NEW).toMatch(/disabled=\{addClass\.isPending \|\| \(clone !== null && !TIME_RE\.test\(startTime\)\)/);
  });

  it("sends the original series' own engine overrides", () => {
    expect(NEW).toMatch(/eligibilityRules: clone\.eligibilityRules, openSpotsVisible: clone\.openSpotsVisible, autoInvites: clone\.autoInvites/);
  });

  it("the class screen opens the clone with the event's model, id and date", () => {
    expect(DETAIL).toMatch(/testID="class-clone"/);
    expect(DETAIL).toMatch(/cloneModel: String\(event\.model\), cloneId: String\(event\.originalId\), cloneDate: event\.date/);
  });
});
