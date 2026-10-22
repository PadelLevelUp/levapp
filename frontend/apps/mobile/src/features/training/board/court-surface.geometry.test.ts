/**
 * PAD-728 (B-606): the board draws its pieces, badges and handles at absolute coordinates.
 * On Android, react-native-svg reports a translated `<G x y>`'s accessibility rect off from
 * where the group is drawn, by an error that grows with x (A1 ~35 px, A2 ~67 px on the lane's
 * pixel_6). TalkBack and Maestro both aim at that rect, so taps on the right half of the court
 * missed. The device proof is Maestro flows 41 and 59 on the Android lane; this keeps a
 * translated group from coming back.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, "court-surface.tsx"), "utf8");

describe("court-surface draws at absolute coordinates (PAD-728)", () => {
  it("has no <G> positioned by x/y (or a translate transform)", () => {
    const groups = src.match(/<G\b[^>]*>/g) ?? [];
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g, g).not.toMatch(/\s(x|y)=\{/);
      expect(g, g).not.toMatch(/transform=/);
    }
  });

  it("places each piece shape at the piece's own point", () => {
    expect(src).toContain("<PieceShape piece={piece} compact={compact} at={v} />");
    expect(src).toMatch(/<Circle cx=\{at\.x\} cy=\{at\.y\} r=\{PLAYER_RADIUS\}/);
  });
});
