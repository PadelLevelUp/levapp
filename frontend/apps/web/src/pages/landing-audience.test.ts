/**
 * PAD-582 (auth.landing-page rule 4): the audience in the URL — `?para=<slug>` first, the older
 * `?audience=` (ids and old Portuguese slugs) still read, anything else is coaches.
 */
import { describe, expect, it } from "vitest";
import { AUDIENCE_SLUG, audienceFromParams } from "./LandingPage";

const read = (qs: string) => audienceFromParams(new URLSearchParams(qs));

describe("the landing audience in the URL", () => {
  it("writes the Portuguese slugs", () => {
    expect(AUDIENCE_SLUG).toEqual({ coaches: "treinadores", players: "jogadores", others: "outros" });
  });

  it.each([
    ["?para=jogadores", "players"],
    ["?para=treinadores", "coaches"],
    ["?para=outros", "others"],
    ["?audience=alunos", "players"],
    ["?audience=players", "players"],
    ["?audience=jogadores", "players"],
    ["?para=jogadores&audience=treinadores", "players"],
    ["?audience=nope", "coaches"],
    ["", "coaches"],
  ])("%s → %s", (qs, expected) => {
    expect(read(qs)).toBe(expected);
  });
});
