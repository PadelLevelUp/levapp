import { describe, expect, it } from "vitest";
import {
  infoCanSave,
  infoChanges,
  infoDraftOf,
  infoEmailEditable,
  infoRequired,
  missingSetup,
  missingSetupKey,
} from "./player-card";

const registered = { email: "ana@example.pt", phone: "912000000", levelId: "3", side: "left" as const, notes: "", pendingRegistration: false };

describe("player card Block 1 rules (players.profile rule 8)", () => {
  it("sends only what changed, and an emptied text as null", () => {
    const draft = { ...infoDraftOf(registered), phone: "913000000" };
    expect(infoChanges(registered, draft)).toEqual({ phone: "913000000" });
    expect(infoChanges(registered, { ...infoDraftOf(registered), notes: "  " })).toEqual({});
    expect(infoChanges({ ...registered, notes: "x" }, { ...infoDraftOf(registered), notes: "" })).toEqual({ notes: null });
  });

  it("never sends the e-mail of a player who is not pending, and sends a pending player's", () => {
    const draft = { ...infoDraftOf(registered), email: "other@example.pt" };
    expect(infoEmailEditable(registered)).toBe(false);
    expect(infoChanges(registered, draft)).toEqual({});
    const pending = { ...registered, email: "", pendingRegistration: true };
    expect(infoChanges(pending, { ...infoDraftOf(pending), email: "new@example.pt" })).toEqual({ email: "new@example.pt" });
  });

  it("[PLAYERS-PROFILE-22] no levels: not required; untouched empty: not blocking; completing: blocking", () => {
    const noLevel = { ...registered, levelId: null };
    expect(infoRequired(false)).toEqual({ level: false, side: true });
    // Bea has no levels: saving a phone works in either session.
    expect(infoCanSave({ session: "complete", hasLevels: false, draft: { ...infoDraftOf(noLevel), phone: "1" } })).toBe(true);
    // Ana has levels: a plain Editar saves a note with Nível still empty.
    expect(infoCanSave({ session: "edit", hasLevels: true, draft: { ...infoDraftOf(noLevel), notes: "n" } })).toBe(true);
    // "Completar informação" waits for the level.
    expect(infoCanSave({ session: "complete", hasLevels: true, draft: { ...infoDraftOf(noLevel), phone: "1" } })).toBe(false);
    expect(infoCanSave({ session: "complete", hasLevels: true, draft: { ...infoDraftOf(noLevel), levelId: "3" } })).toBe(true);
    expect(infoCanSave({ session: "edit", hasLevels: true, draft: infoDraftOf(registered), saving: true })).toBe(false);
  });

  it("names what is missing", () => {
    expect(missingSetup({ levelId: null, side: "left" })).toEqual(["level"]);
    expect(missingSetup({ levelId: "1", side: null })).toEqual(["side"]);
    expect(missingSetup({})).toEqual(["level", "side"]);
    expect(missingSetupKey(["level", "side"])).toBe("players.card.missingBoth");
    expect(missingSetupKey(["side"])).toBe("players.card.missingSide");
    expect(missingSetupKey([])).toBeNull();
  });
});
