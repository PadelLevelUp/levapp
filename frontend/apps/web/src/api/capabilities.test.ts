import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The capabilities this shell declares (X-LevApp-Capabilities, PAD-352). A token that goes missing
 * silently withdraws a feature and nothing crashes, so the declaration is pinned here.
 * coach-invite-email: clubs.coach-invitation rule 9 (PAD-477). This shell's accept form sends the
 * email, so the server may refuse a request without one. That the spelling matches the server's
 * constant is pinned on the backend (test_pad477_capability_spelling_matches_both_shells).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "./client.ts"), "utf8");
const declared = (() => {
  const m = source.match(/capabilities:\s*\[([^\]]*)\]/);
  if (!m) throw new Error("no capabilities: [...] declaration found in ./client.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

describe("web shell capabilities", () => {
  it("declares coach-invite-email", () => {
    expect(declared).toContain("coach-invite-email");
  });
});
