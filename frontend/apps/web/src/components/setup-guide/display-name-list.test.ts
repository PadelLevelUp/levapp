import { describe, expect, it } from "vitest";
import { COACH_NAME_LIST } from "@/lib/coach-display-name-list";

/**
 * PAD-839: the setup guide's `.name` reads are reviewed, not backlog. They are a schedule's name
 * chip and a coach's name shown to the student, never a player's name (players.nickname rule 9d).
 */
describe("the setup guide in the coach display-name list", () => {
  it("lists every setup-guide file as allowed, with a PAD-839 reason", () => {
    const files = ["src/components/setup-guide/ScheduleEditor.tsx", "src/components/setup-guide/StepUnavailability.tsx", "src/pages/SetupGuidePage.tsx"];
    for (const file of files) {
      const entry = COACH_NAME_LIST.find((e) => e.file === file);
      expect(entry, file).toBeDefined();
      expect(entry?.kind, file).toBe("allowed");
      expect(entry?.reason, file).toMatch(/^PAD-839: /);
    }
  });
});
