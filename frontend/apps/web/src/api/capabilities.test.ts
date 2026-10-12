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
  // The list lives in `WEB_CAPABILITIES` since PAD-642 (the streamed import sends it too).
  const m = source.match(/WEB_CAPABILITIES = \[([^\]]*)\]/);
  if (!m) throw new Error("no WEB_CAPABILITIES = [...] declaration found in ./client.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

describe("web shell capabilities", () => {
  it("declares coach-invite-email", () => {
    expect(declared).toContain("coach-invite-email");
  });

  // terms-acceptance: auth.register rule 19 (PAD-485). This shell's sign-up form has the required Terms
  // checkbox and sends `termsAccepted`, so the server may refuse a sign-up without it.
  it("declares terms-acceptance", () => {
    expect(declared).toContain("terms-acceptance");
  });

  // PAD-637 (auth.register rule 19b): the invite and activation forms carry the Terms box.
  it("declares terms-on-completion", () => {
    expect(declared).toContain("terms-on-completion");
  });

  // PAD-642 (players.create rule 10, import.confirm rule 5): create and import carry the coach's 18+ box.
  it("declares adult-roster-confirmation", () => {
    expect(declared).toContain("adult-roster-confirmation");
  });

  it("is what the client actually sends", () => {
    expect(source).toContain("capabilities: WEB_CAPABILITIES");
  });
});
