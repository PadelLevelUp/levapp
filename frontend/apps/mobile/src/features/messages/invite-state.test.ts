import { describe, expect, it } from "vitest";

import { inviteState } from "./invite-state";

// notifications.invitations rule 9 (PAD-563): the invite bubble reads purely off metadata, and a
// coach-recorded answer says so.
describe("inviteState", () => {
  it("is waiting until an answer is on record", () => {
    expect(inviteState(undefined)).toMatchObject({ waiting: true, accepted: false, declined: false, spotFilled: false, byCoach: false });
    expect(inviteState({ responded: false })).toMatchObject({ waiting: true });
  });

  it("shows the student's own answer without the coach line", () => {
    expect(inviteState({ responded: true, response: "yes", answeredBy: "student" })).toMatchObject({ accepted: true, byCoach: false, waiting: false });
    expect(inviteState({ responded: true, response: "no" })).toMatchObject({ declined: true, byCoach: false });
  });

  it("marks an answer the coach recorded (PAD-563)", () => {
    expect(inviteState({ responded: true, response: "yes", answeredBy: "coach" })).toMatchObject({ accepted: true, byCoach: true, waiting: false });
    expect(inviteState({ responded: true, response: "no", answeredBy: "coach" })).toMatchObject({ declined: true, byCoach: true });
  });

  it("reads any other recorded response as spot filled, never as by the coach", () => {
    expect(inviteState({ responded: true, response: "expired" })).toMatchObject({ spotFilled: true, byCoach: false });
    expect(inviteState({ responded: true, response: "spot_filled", answeredBy: "coach" })).toMatchObject({ spotFilled: true, byCoach: false });
  });
});
