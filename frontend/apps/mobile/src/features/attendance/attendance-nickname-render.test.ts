import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-660 part 2 (players.nickname rule 8): the attendance and absence history screens a coach
 * opens for a student print the coach's display name in the subtitle; the student's own view
 * never asks for the roster. Source-reading: the screens mount react-query hooks, and they live
 * under app/ where a test file would break Metro. */
const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe.each(["app/attendance.tsx", "app/absences.tsx"])("%s", (file) => {
  const src = read(file);

  it("asks the resolver only for a coach's view of one player", () => {
    expect(src).toMatch(/useCoachDisplayName\(\{ enabled: (coachView|isCoachView) \}\)/);
  });

  it("prints the coach's name for the history's player, falling back to the payload's name", () => {
    expect(src).toMatch(/displayName\(history\?\.playerId \?\? playerId, history\?\.playerName \?\? ""\)/);
    expect(src).not.toMatch(/name: history\?\.playerName \?\? ""/);
  });
});
