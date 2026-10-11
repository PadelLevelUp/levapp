import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { publicWebLink } from "./publicWebLink";

/**
 * PAD-595 step 1: shareable links and QR codes are built on the API's public web origin
 * (PUBLIC_WEB_ORIGIN), never on `window.location.origin` — the old padellevelup.com domain still
 * serves the app, so links built from the browsed address printed the old domain.
 */
describe("publicWebLink", () => {
  it("joins the origin and the path with exactly one slash", () => {
    expect(publicWebLink("https://levapp.app", "/join/coach/abc")).toBe("https://levapp.app/join/coach/abc");
    expect(publicWebLink("https://levapp.app/", "join/coach/abc")).toBe("https://levapp.app/join/coach/abc");
    expect(publicWebLink("https://levapp.app//", "//register/7?t=x")).toBe("https://levapp.app/register/7?t=x");
  });

  it("keeps an already absolute link as the server sent it", () => {
    expect(publicWebLink("https://levapp.app", "https://staging.levapp.app/invite/player/t")).toBe("https://staging.levapp.app/invite/player/t");
  });

  it("an empty path is the origin itself", () => {
    expect(publicWebLink("https://levapp.app/", "")).toBe("https://levapp.app");
  });
});

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILDERS = [
  "components/settings/ClubSection.tsx",
  "components/players/AddByQrDialog.tsx",
  "components/players/detail/PlayerHeader.tsx",
  "components/players/EditPlayerSheet.tsx",
  "pages/PlayersPage.tsx",
];

describe("the coach's share links are built on the public origin (PAD-595)", () => {
  it.each(BUILDERS)("%s builds its link with publicWebLink, not window.location.origin", (file) => {
    const source = fs.readFileSync(path.join(SRC, file), "utf8");
    expect(source).toContain("publicWebLink(");
    expect(source).not.toContain("window.location.origin");
  });
});
