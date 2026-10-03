import { describe, expect, it, vi } from "vitest";

import { commitClassEdit, createClassCreateFlow, hasClassEditChanges } from "./class-save-flow";

/**
 * classes.create rule 10 and classes.edit rule 9 (PAD-474): the screens' save
 * sequences. new.tsx and [id].tsx call these and nothing else to decide whether,
 * and when, to save — so a test here is a test of what the coach gets.
 */

const ANA = { playerId: "1", name: "Ana" };

function createHarness(over: Partial<{ conflict: boolean; ids: string[]; slot: boolean; lookup: () => Promise<typeof ANA[]> }> = {}) {
  let acknowledged = false;
  const calls: string[] = [];
  const save = vi.fn(async () => { calls.push("save"); });
  const checkAvailabilityConflicts = vi.fn(over.lookup ?? (async () => [] as typeof ANA[]));
  const checkEligibility = vi.fn();
  const ui = {
    askOverlap: vi.fn(() => { calls.push("overlap"); }),
    askUnavailable: vi.fn((s: typeof ANA[]) => { calls.push(`unavailable:${s.map((x) => x.name).join(",")}`); }),
    acknowledgeUnavailable: vi.fn(() => { acknowledged = true; }),
  };
  // As the real notificationEngine module, the API offers eligibility too; create must not use it.
  const api = {
    checkAvailabilityConflicts: (...a: Parameters<typeof checkAvailabilityConflicts>) => {
      calls.push("lookup");
      return checkAvailabilityConflicts(...a);
    },
    checkEligibility,
  };
  const flow = createClassCreateFlow({
    hasConflict: () => over.conflict ?? false,
    slot: () => (over.slot === false ? null : { date: "2026-10-04", startTime: "09:00", endTime: "10:00" }),
    playerIds: () => over.ids ?? ["1"],
    acknowledged: () => acknowledged,
    api,
    save,
    ui,
  });
  return { flow, save, ui, calls, checkAvailabilityConflicts, checkEligibility };
}

describe("create: the save sequence (classes.create rule 10)", () => {
  it("an unavailable chosen student is named, and nothing is saved until the coach confirms", async () => {
    const h = createHarness({ lookup: async () => [ANA] });
    await h.flow.start();
    expect(h.ui.askUnavailable).toHaveBeenCalledWith([ANA]);
    expect(h.save).not.toHaveBeenCalled();
    await h.flow.confirmUnavailable();
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.checkAvailabilityConflicts).toHaveBeenCalledWith("2026-10-04", "09:00", "10:00", ["1"]);
  });

  it("the overlap warning comes first; the unavailable lookup runs only after it is confirmed", async () => {
    const h = createHarness({ conflict: true, lookup: async () => [ANA] });
    await h.flow.start();
    expect(h.calls).toEqual(["overlap"]);
    await h.flow.afterOverlap();
    expect(h.calls).toEqual(["overlap", "lookup", "unavailable:Ana"]);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("a failed lookup saves anyway", async () => {
    const h = createHarness({ lookup: async () => { throw new Error("offline"); } });
    await h.flow.start();
    expect(h.save).toHaveBeenCalledOnce();
    expect(h.ui.askUnavailable).not.toHaveBeenCalled();
  });

  it("once confirmed it does not ask again", async () => {
    const h = createHarness({ lookup: async () => [ANA] });
    await h.flow.start();
    await h.flow.confirmUnavailable();
    await h.flow.start();
    expect(h.checkAvailabilityConflicts).toHaveBeenCalledOnce();
    expect(h.save).toHaveBeenCalledTimes(2);
  });

  it("no students, or no complete slot, saves without a lookup", async () => {
    for (const over of [{ ids: [] as string[] }, { slot: false }]) {
      const h = createHarness(over);
      await h.flow.start();
      expect(h.checkAvailabilityConflicts).not.toHaveBeenCalled();
      expect(h.save).toHaveBeenCalledOnce();
    }
  });

  it("runs no eligibility check (eligibility.enforcement 7d is for edits)", async () => {
    const h = createHarness({ ids: ["1", "2"] });
    await h.flow.start();
    expect(h.checkEligibility).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledOnce();
  });

  it("applies no cap: more students than the capacity still save", async () => {
    const h = createHarness({ ids: ["1", "2", "3", "4", "5"] });
    await h.flow.start();
    expect(h.save).toHaveBeenCalledOnce();
  });
});

const base = { name: "Terça", maxPlayers: 4, participants: [{ id: "1" }] };

function editHarness(draft: typeof base, ineligible: { playerId: string }[] = []) {
  const finalize = vi.fn(async () => {});
  const eligibility = vi.fn(async () => ({ ineligible }));
  const ui = { nothingToSave: vi.fn(), askEligibility: vi.fn() };
  return { finalize, eligibility, ui, run: () => commitClassEdit({ original: base, draft, eligibility, finalize, ui }) };
}

describe("edit: the save decision (classes.edit rule 9)", () => {
  it("a participants-only edit is saved", async () => {
    const h = editHarness({ ...base, participants: [{ id: "1" }, { id: "2" }] });
    await h.run();
    expect(h.finalize).toHaveBeenCalledWith({ addPlayers: ["2"] });
    expect(h.ui.nothingToSave).not.toHaveBeenCalled();
    expect(hasClassEditChanges(base, { ...base, participants: [{ id: "2" }] })).toBe(true);
  });

  it("an untouched draft saves nothing", async () => {
    const h = editHarness(structuredClone(base));
    await h.run();
    expect(h.ui.nothingToSave).toHaveBeenCalledOnce();
    expect(h.finalize).not.toHaveBeenCalled();
    expect(hasClassEditChanges(base, structuredClone(base))).toBe(false);
  });

  it("adding a student who fails the bar asks first, naming them, and does not save", async () => {
    const h = editHarness({ ...base, participants: [{ id: "1" }, { id: "2" }] }, [{ playerId: "2" }]);
    await h.run();
    expect(h.eligibility).toHaveBeenCalledWith(["2"]);
    expect(h.ui.askEligibility).toHaveBeenCalledWith([{ playerId: "2" }], { addPlayers: ["2"] });
    expect(h.finalize).not.toHaveBeenCalled();
  });

  it("a removal alone runs no eligibility check", async () => {
    const h = editHarness({ ...base, participants: [] });
    await h.run();
    expect(h.eligibility).not.toHaveBeenCalled();
    expect(h.finalize).toHaveBeenCalledWith({ removePlayers: ["1"] });
  });

  it("a failed eligibility check saves anyway", async () => {
    const h = editHarness({ ...base, participants: [{ id: "1" }, { id: "2" }] });
    h.eligibility.mockRejectedValueOnce(new Error("offline"));
    await h.run();
    expect(h.finalize).toHaveBeenCalledWith({ addPlayers: ["2"] });
  });

  it("applies no cap: adding past maxPlayers is saved", async () => {
    const full = { ...base, maxPlayers: 1 };
    const finalize = vi.fn(async () => {});
    await commitClassEdit({
      original: full,
      draft: { ...full, participants: [{ id: "1" }, { id: "2" }] },
      eligibility: async () => ({ ineligible: [] }),
      finalize,
      ui: { nothingToSave: vi.fn(), askEligibility: vi.fn() },
    });
    expect(finalize).toHaveBeenCalledWith({ addPlayers: ["2"] });
  });
});

describe("edit: the court reaches the save in every scope (clubs.courts rule 9, PAD-513)", () => {
  // [id].tsx passes these changes to editClass with the scope the coach chose;
  // "this occurrence only" and a class that does not recur both save as "single".
  const original = { ...base, courtId: 1 as number | null };

  it("a court chosen in the editor is sent as courtId", async () => {
    const finalize = vi.fn(async () => {});
    await commitClassEdit({
      original,
      draft: { ...original, courtId: 2 },
      eligibility: vi.fn(async () => ({ ineligible: [] })),
      finalize,
      ui: { nothingToSave: vi.fn(), askEligibility: vi.fn() },
    });
    expect(finalize).toHaveBeenCalledWith({ courtId: 2 });
  });

  it("\"No court\" is sent as courtId null, for the server to store or refuse", async () => {
    const finalize = vi.fn(async () => {});
    await commitClassEdit({
      original,
      draft: { ...original, courtId: null },
      eligibility: vi.fn(async () => ({ ineligible: [] })),
      finalize,
      ui: { nothingToSave: vi.fn(), askEligibility: vi.fn() },
    });
    expect(finalize).toHaveBeenCalledWith({ courtId: null });
  });
});
