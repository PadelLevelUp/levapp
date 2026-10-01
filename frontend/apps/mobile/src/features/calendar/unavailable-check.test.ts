import { describe, expect, it, vi } from "vitest";

import { unavailableBeforeSave } from "./unavailable-check";

/**
 * classes.create rule 10 → calendar.student-blockers rule 9 (PAD-107), as web's
 * AddClassSheet.checkUnavailableThenSave: which chosen students to warn about
 * before saving. An empty answer means "save now".
 */
describe("unavailableBeforeSave", () => {
  it("returns the blocked students the lookup names", async () => {
    const lookup = vi.fn().mockResolvedValue([{ name: "Ana" }]);
    await expect(unavailableBeforeSave({ acknowledged: false, playerIds: ["1"], lookup })).resolves.toEqual([
      { name: "Ana" },
    ]);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("a failed lookup saves anyway", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(unavailableBeforeSave({ acknowledged: false, playerIds: ["1"], lookup })).resolves.toEqual([]);
  });

  it("once acknowledged it does not ask again", async () => {
    const lookup = vi.fn().mockResolvedValue([{ name: "Ana" }]);
    await expect(unavailableBeforeSave({ acknowledged: true, playerIds: ["1"], lookup })).resolves.toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("with no students chosen it does not look", async () => {
    const lookup = vi.fn().mockResolvedValue([{ name: "Ana" }]);
    await expect(unavailableBeforeSave({ acknowledged: false, playerIds: [], lookup })).resolves.toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });
});
