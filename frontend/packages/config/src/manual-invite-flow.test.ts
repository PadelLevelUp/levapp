import { describe, expect, it, vi } from "vitest";

import { runManualInviteFlow } from "./manual-invite-flow";

// eligibility.enforcement rule 6a (PAD-562): one check, one dialog for the whole selection,
// send only on confirm; a failed check never blocks.
describe("runManualInviteFlow", () => {
  const failing = [{ playerId: "7", name: "Rita", failures: [] }];

  it("sends at once when nobody fails the bar", async () => {
    const send = vi.fn(async () => {});
    const ask = vi.fn();
    const outcome = await runManualInviteFlow({
      playerIds: ["7", "8"],
      check: async () => [],
      send,
      ui: { askEligibility: ask },
    });
    expect(outcome).toBe("sent");
    expect(send).toHaveBeenCalledWith(["7", "8"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks once with every failing student and sends nothing until confirmed", async () => {
    const send = vi.fn(async () => {});
    let proceed: (() => Promise<void>) | null = null;
    const ask = vi.fn((f: typeof failing, p: () => Promise<void>) => { proceed = p; });
    const outcome = await runManualInviteFlow({
      playerIds: ["7", "8"],
      check: async () => failing,
      send,
      ui: { askEligibility: ask },
    });
    expect(outcome).toBe("asked");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toEqual(failing);
    expect(send).not.toHaveBeenCalled(); // cancel = never calling proceed
    await proceed!();
    expect(send).toHaveBeenCalledWith(["7", "8"]); // confirm sends the whole selection
  });

  it("falls through to the send when the check fails (the warning never blocks)", async () => {
    const send = vi.fn(async () => {});
    const ask = vi.fn();
    const outcome = await runManualInviteFlow({
      playerIds: ["7"],
      check: async () => { throw new Error("offline"); },
      send,
      ui: { askEligibility: ask },
    });
    expect(outcome).toBe("sent");
    expect(send).toHaveBeenCalledWith(["7"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("does nothing for an empty selection", async () => {
    const send = vi.fn(async () => {});
    const check = vi.fn(async () => []);
    await runManualInviteFlow({ playerIds: [], check, send, ui: { askEligibility: vi.fn() } });
    expect(check).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
