import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-798 (notifications.manual rule 10): once the class has started, Notificar gives way to the
 * warning "invitations are closed", same test ids as web, and the dashboard's `notify=1` no longer
 * opens the picker. "Started" is `hasClassStarted` (club clock), pinned in attendance-decline.test.
 * Source-reading: app/class/[id].tsx mounts react-query hooks, and a test file under app/ would
 * break Metro. */
const SCREEN = readFileSync(resolve(__dirname, "../../..", "app/class/[id].tsx"), "utf8");

describe("Notificar on a class that has started (PAD-798)", () => {
  it("decides it with the shared club-clock check on the class's own date and start", () => {
    expect(SCREEN).toMatch(/const notifyClosed = hasClassStarted\(active\?\.date \?\? event\?\.date, active\?\.startTime \?\? event\?\.startTime\)/);
  });

  it("the warning stands where Notificar was", () => {
    expect(SCREEN).toMatch(
      /notifyClosed \? \([\s\S]{0,200}testID="class-notify-closed"[\s\S]{0,200}t\("calendar\.notify\.classStarted"\)[\s\S]{0,80}\) : \([\s\S]{0,200}testID="class-notify"/,
    );
  });

  it("notify=1 does not open the picker once the class has started", () => {
    expect(SCREEN).toMatch(/notifyParam === "1" && isCoach && !isPending && !notifyClosed && !autoNotifiedRef\.current/);
  });
});
