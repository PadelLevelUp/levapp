import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-595 on iOS: the coach invitation link is handed out on the configured public web origin
 * (levapp.app), like every other iOS share link (lib/web-links), not as the API's bare relative
 * path. The screen mounts native modules the unit harness cannot, so this pins the wiring; the
 * joining rule itself is tested in lib/web-links.test.ts.
 */
const SOURCE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "club-section.tsx"),
  "utf8",
);

describe("the iOS coach invitation link (PAD-595)", () => {
  it("is prefixed with WEB_APP_URL", () => {
    expect(SOURCE).toContain("setInviteUrl(webAppLink(WEB_APP_URL, created.inviteLink));");
    expect(SOURCE).not.toContain("setInviteUrl(created.inviteLink);");
  });
});
