import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REFRESH_SPINNER_MAX_MS, refetchAll, runRefresh } from "./pull-refresh";

/**
 * PAD-786 — client.pull-to-refresh rules 1, 3, 4 and 5. The hook itself is a thin React shell
 * over `runRefresh` (the mobile harness cannot mount react-query hooks), so the outcomes are
 * proved here and the screens' wiring is read from their sources.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("runRefresh (rule 3)", () => {
  it("is 'ok' when the refresh resolves", async () => {
    await expect(runRefresh(async () => undefined)).resolves.toBe("ok");
  });

  it("is 'failed' when any refetch of the pull failed (rule 4)", async () => {
    const outcome = runRefresh(() =>
      refetchAll(
        async () => ({ isError: false }),
        async () => ({ isError: true })
      )
    );
    await expect(outcome).resolves.toBe("failed");
  });

  it("is 'ok' when every refetch succeeded", async () => {
    await expect(
      runRefresh(() => refetchAll(async () => ({ isError: false }), async () => undefined))
    ).resolves.toBe("ok");
  });

  it("lets go of a refresh that never settles at the bound, not before", async () => {
    vi.useFakeTimers();
    expect(REFRESH_SPINNER_MAX_MS).toBe(45_000);
    let outcome: string | null = null;
    void runRefresh(() => new Promise(() => {})).then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(REFRESH_SPINNER_MAX_MS - 1);
    expect(outcome).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe("timed-out");
  });
});

describe("the screens' pull wiring (rules 1, 5)", () => {
  const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = (path: string) => readFileSync(resolve(mobile, path), "utf8");

  const screens: Array<[string, string]> = [
    ["app/(tabs)/players.tsx", "players-refresh"],
    ["app/(tabs)/messages.tsx", "messages-refresh"],
    ["app/(tabs)/calendar.tsx", "calendar-refresh"],
    ["src/features/presences/PresencesScreen.tsx", "presences-refresh"],
  ];

  it.each(screens)("%s has a RefreshControl driven by usePullToRefresh", (path, testID) => {
    const source = read(path);
    expect(source).toContain(`testID="${testID}"`);
    expect(source).toMatch(/usePullToRefresh\(/);
    expect(source).toMatch(/refreshing=\{pull\.refreshing\}/);
    expect(source).not.toMatch(/refreshing=\{[^}]*isRefetching/);
  });

  it("the validation sheet's list takes the pull, and both its scroll areas drop the keyboard on a drag", () => {
    const sheet = read("src/features/presences/ValidateClassesSheet.tsx");
    expect(sheet).toContain('testID="presences-validate-refresh"');
    expect(sheet).toContain("alwaysBounceVertical");
    expect(sheet.match(/keyboardDismissMode="on-drag"/g)).toHaveLength(2);
    expect(sheet.match(/<ScrollView\b/g)).toHaveLength(2);
    expect(read("src/features/presences/PresencesScreen.tsx")).toMatch(
      /refreshing=\{sheetPull\.refreshing\}\s*onRefresh=\{sheetPull\.onRefresh\}/
    );
  });
});
