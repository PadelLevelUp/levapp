import { describe, expect, it } from "vitest";

import enPlayers from "../../../src/locales/en/players.json";
import ptPlayers from "../../../src/locales/pt/players.json";

import { SIDE_LABEL_KEYS } from "./domain";
import type { PlayerSide } from "./domain";

/**
 * PAD-182: a player's court side used to be labelled by a `sideLabel()` helper
 * with its own en/es table, so a Portuguese app showed "Right"/"Left". The
 * labels now live in the shared locale tree and are rendered with `t()`.
 *
 * These tests guard the failure mode that swap introduces: if a
 * `players.side*` key is missing from a locale file, i18next renders the raw
 * key path ("players.sideRight") straight into the badge. Both shells read the
 * same `src/locales/` tree (web via import.meta.glob, mobile via the static
 * namespace imports in apps/mobile/src/lib/i18n.ts), so covering it once
 * covers web and iOS.
 */

const SIDES: PlayerSide[] = ["left", "right", "both"];

/** Resolve a dotted i18next key against a namespace JSON file. */
function resolve(dict: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      dict
    );
}

describe("SIDE_LABEL_KEYS", () => {
  it("covers every PlayerSide", () => {
    expect(Object.keys(SIDE_LABEL_KEYS).sort()).toEqual([...SIDES].sort());
  });

  it.each(SIDES)("resolves to a real Portuguese string for %s", (side) => {
    const value = resolve(ptPlayers, SIDE_LABEL_KEYS[side]);
    expect(typeof value).toBe("string");
    expect(value).not.toBe("");
  });

  it.each(SIDES)("resolves to a real English string for %s", (side) => {
    const value = resolve(enPlayers, SIDE_LABEL_KEYS[side]);
    expect(typeof value).toBe("string");
    expect(value).not.toBe("");
  });

  it("renders the Portuguese labels from the ticket's acceptance criterion", () => {
    expect(resolve(ptPlayers, SIDE_LABEL_KEYS.left)).toBe("Esquerda");
    expect(resolve(ptPlayers, SIDE_LABEL_KEYS.right)).toBe("Direita");
    expect(resolve(ptPlayers, SIDE_LABEL_KEYS.both)).toBe("Ambos");
  });

  it("keeps the English labels the E2E suite asserts on", () => {
    expect(resolve(enPlayers, SIDE_LABEL_KEYS.left)).toBe("Left");
    expect(resolve(enPlayers, SIDE_LABEL_KEYS.right)).toBe("Right");
    expect(resolve(enPlayers, SIDE_LABEL_KEYS.both)).toBe("Both");
  });
});
