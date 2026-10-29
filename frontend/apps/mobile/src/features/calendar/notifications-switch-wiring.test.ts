import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * classes.create rule 6b (PAD-793, B-709; owner, 2026-10-29) on iOS. The new-class screen mounts
 * react-query hooks the unit harness cannot, so this reads the source, as `clone-wiring.test.ts`
 * does; Maestro flow 314 walks it. The switch is always shown, starts off, and its value is what
 * the create sends; the class screen shows its own switch whatever the coach's engine state.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const NEW = fs.readFileSync(path.join(MOBILE_ROOT, "app/class/new.tsx"), "utf8");
const DETAIL = fs.readFileSync(path.join(MOBILE_ROOT, "app/class/[id].tsx"), "utf8");

describe("the notifications switch on iOS (PAD-793)", () => {
  it("the new-class form has the switch, starting off, and sends its value", () => {
    expect(NEW).toMatch(/testID="class-new-auto-notify-switch"/);
    expect(NEW).toMatch(/const \[notificationsEnabled, setNotificationsEnabled\] = React\.useState\(false\)/);
    expect(NEW).toMatch(/^\s*notificationsEnabled,$/m);
    expect(NEW).toMatch(/setNotificationsEnabled\(clone\.notificationsEnabled\)/);
  });

  it("neither screen hides the switch behind the coach's engine state", () => {
    expect(NEW).not.toMatch(/useAutoInviteEnabled/);
    expect(DETAIL).not.toMatch(/useAutoInviteEnabled/);
    expect(DETAIL).toMatch(/testID="class-auto-notify-toggle"/);
  });
});
