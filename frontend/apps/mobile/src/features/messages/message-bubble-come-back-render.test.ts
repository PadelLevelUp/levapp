import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-684 (attendance.confirm rule 28): the reminder bubble's "Afinal vou", same test ids as web.
 * Source-reading: the bubble pulls in reanimated and gesture-handler. */
const BUBBLE = readFileSync(resolve(__dirname, "components/message-bubble.tsx"), "utf8");
const SCREEN = readFileSync(resolve(__dirname, "../../../app/conversation/[id].tsx"), "utf8");

describe("the reminder bubble offers 'Afinal vou' after a recorded no (PAD-684 rule 28)", () => {
  it("only for a recorded no on a class that has not started", () => {
    expect(BUBBLE).toMatch(/canComeBack = reminder\.declined && message\.metadata\?\.response === "no" && reminderClassInFuture/);
    expect(BUBBLE).toMatch(/canComeBack && !comeBackShown[\s\S]{0,200}testID="bubble-come-back"/);
  });

  it("the tap answers yes through the screen's reminder handler and renders the server's answer", () => {
    expect(BUBBLE).toContain('await onRespondReminder?.("yes")');
    expect(BUBBLE).toContain("comeBackFromAnswer({ action })");
    expect(SCREEN).toMatch(/return m \? latestRef\.current\.handleRespondToReminder\(m, action\)/);
    expect(SCREEN).toContain("return result?.action ?? null");
  });

  it("spot_filled: the spot-taken line and the join for the reminder's instance", () => {
    expect(BUBBLE).toContain('testID="bubble-come-back-spot-taken"');
    expect(BUBBLE).toMatch(/testID="bubble-come-back-waiting-list"[\s\S]{0,300}onPress=\{handleComeBackWaitingList\}/);
    expect(BUBBLE).toContain('model: "LessonInstance", originalId: instanceId');
    expect(BUBBLE).toContain('testID="bubble-come-back-on-waiting-list"');
  });
});
