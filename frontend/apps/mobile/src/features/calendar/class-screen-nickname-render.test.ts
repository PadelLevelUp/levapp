import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-660 part 2 (players.nickname rule 8): the class screen's coach-only lists of students
 * (join requests, invitees) and their toasts name the student as the coach does. Source-reading:
 * app/class/[id].tsx mounts react-query hooks, and a test file under app/ would break Metro. */
const SCREEN = readFileSync(resolve(__dirname, "../../..", "app/class/[id].tsx"), "utf8");

describe("the class screen names students as the coach does (PAD-660 rule 8)", () => {
  it("asks the resolver only for a coach", () => {
    expect(SCREEN).toContain("useCoachDisplayName({ enabled: isCoach })");
  });

  it("prints join requests and invitees through it, with the row's player id", () => {
    expect(SCREEN).toMatch(/displayName\(req\.playerId, req\.playerName\)/);
    expect(SCREEN).toMatch(/displayName\(inv\.playerId, inv\.playerName\)/);
    expect(SCREEN).not.toMatch(/\{req\.playerName\}/);
    expect(SCREEN).not.toMatch(/\{inv\.playerName\}/);
  });

  it("the decision toast names the request's student the same way", () => {
    expect(SCREEN).toMatch(/name: req \? displayName\(req\.playerId, req\.playerName\) : ""/);
  });
});
