import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-660 part 2 (players.nickname rule 8): the coach's evaluation screens print the coach's
 * display name for the student. Source-reading: both screens mount react-query hooks the
 * harness cannot. What is SENT (the share flow's route params) keeps the real name. */
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("evaluations print the coach's name for the student (PAD-660 rule 8)", () => {
  const player = read("player-evaluations-screen.tsx");
  const klass = read("class-evaluations-screen.tsx");

  it("the player's history title uses the display name for the screen's player id", () => {
    expect(player).toContain("useCoachDisplayName");
    expect(player).toMatch(/name: displayName\(playerId, playerName\)/);
  });

  it("the history cards still get the real name: it is the share flow's, and that text is sent", () => {
    expect(player).toMatch(/playerName=\{playerName\}/);
  });

  it("the class evaluations rows name, label and initial the student by the display name", () => {
    expect(klass).toContain("useCoachDisplayName");
    expect(klass).toMatch(/displayName\(id, participant\.name\)/);
    expect(klass).not.toMatch(/\{participant\.name\}/);
    expect(klass).not.toMatch(/initials\(participant\.name\)/);
    expect(klass).not.toMatch(/accessibilityLabel=\{participant\.name\}/);
  });
});
