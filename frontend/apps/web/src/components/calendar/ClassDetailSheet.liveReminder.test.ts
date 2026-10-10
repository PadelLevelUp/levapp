import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * B-542 / PAD-600 (attendance.confirm rule 27, "The ask reaches an open class detail live").
 * The sheet's SSE subscription was coach-only, so a student's open sheet never learned of the
 * reminder. Like the sibling `.test.ts` files, this pins the source: the subscription is not
 * gated on `canManage`, the shared predicate is asked first, and a match re-reads the instance.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, "ClassDetailSheet.tsx"), "utf8");

describe("the sheet refetches when the reminder lands (rule 27, B-542)", () => {
  it("subscribes for students too and asks the shared predicate before the coach branches", () => {
    expect(src).not.toContain("if (!open || !canManage || !token) return;");
    expect(src).toContain("if (!open || !token) return;");
    const predicate = src.indexOf("reminderArrivedFor(");
    const coachGate = src.indexOf("if (!canManage) return;");
    expect(predicate).toBeGreaterThan(-1);
    expect(coachGate).toBeGreaterThan(predicate);
  });
  it("re-reads the instance on a match", () => {
    const after = src.slice(src.indexOf("reminderArrivedFor("));
    const block = after.slice(0, after.indexOf("if (!canManage) return;"));
    expect(block).toContain("getClassInstance(");
    expect(block).toContain("setClassInstance");
  });
});
