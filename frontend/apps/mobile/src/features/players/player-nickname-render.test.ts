import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-660 (players.nickname rule 3): the players list and the profile header show the coach's
 * display name; the profile puts the real name under a shown nickname; the edit save sends the
 * nickname fields. Source-reading: the harness cannot mount the react-query screens. */
const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe("player nickname on the mobile screens (PAD-660)", () => {
  const list = read("app/(tabs)/players.tsx");
  const detail = read("app/player/[playerId].tsx");

  it("lists the display name, not the raw name", () => {
    expect(list).toMatch(/item\.displayName \?\? item\.name/);
  });

  it("headers the profile with the display name and the real name under a shown nickname", () => {
    expect(detail).toMatch(/player\??\.displayName \?\? player\??\.name/);
    expect(detail).toMatch(/nicknameShown\(player\)/);
    expect(detail).toContain('testID="player-real-name"');
  });

  it("sends the nickname fields on save, and the edit form is the only one asking for them", () => {
    expect(detail).toMatch(/nickname:/);
    expect(detail).toMatch(/nicknameAsName:/);
    expect(detail).toMatch(/showNickname/);
    expect(read("app/player/new.tsx")).not.toMatch(/showNickname/);
  });
});
