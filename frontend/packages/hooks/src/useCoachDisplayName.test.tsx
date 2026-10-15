// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useCoachDisplayName } from "./useCoachDisplayName";

/**
 * PAD-660 part 2 (`players.nickname` rules 3 and 8): every coach view that prints a student's
 * name from a shared payload resolves it through this one hook, from the coach's OWN roster.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const roster = [
  { playerId: "7", name: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato" },
];

describe("useCoachDisplayName", () => {
  it("resolves a student on the coach's roster to their display name, others to the fallback", async () => {
    const fetchRoster = vi.fn(async () => roster as never);
    const { result } = renderHook(() => useCoachDisplayName({ fetchRoster }), { wrapper });
    await waitFor(() => expect(result.current(7, "Jorge Silva")).toBe("Jorge chato"));
    expect(result.current("99", "Ana")).toBe("Ana");
  });

  it("never asks for the roster when disabled (a student's view) and returns the fallback", async () => {
    const fetchRoster = vi.fn(async () => roster as never);
    const { result } = renderHook(() => useCoachDisplayName({ enabled: false, fetchRoster }), { wrapper });
    expect(result.current(7, "Jorge Silva")).toBe("Jorge Silva");
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRoster).not.toHaveBeenCalled();
  });
});
