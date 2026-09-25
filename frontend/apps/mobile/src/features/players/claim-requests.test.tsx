/**
 * players.join-token rule 8a (PAD-444, B-197) on iOS: accepting a coach's claim links the student,
 * so the client re-reads /me; rejecting one refreshes nothing. react-query is shimmed (the harness
 * contract, frontend/CLAUDE.md).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

const listMyClaimRequests = vi.fn();
const acceptClaimRequest = vi.fn();
const rejectClaimRequest = vi.fn();
vi.mock("@levelup/api", () => ({
  playerClaimsApi: {
    listMyClaimRequests: (...a: unknown[]) => listMyClaimRequests(...a),
    acceptClaimRequest: (...a: unknown[]) => acceptClaimRequest(...a),
    rejectClaimRequest: (...a: unknown[]) => rejectClaimRequest(...a),
  },
}));
vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");
  return {
    useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
      const [data, setData] = React.useState<unknown>(undefined);
      React.useEffect(() => {
        queryFn().then(setData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { data, isPending: data === undefined };
    },
    useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  };
});
const refreshUser = vi.fn();
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ refreshUser }) }));
vi.mock("@/features/players/hooks", () => ({ coachPlayersKey: ["coach-players"] }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ClaimRequests } from "./claim-requests";

const REQ = { id: "5", coachName: "Maria", clubName: "Padel Norte", placeholderName: "Ana S." };

beforeEach(() => {
  listMyClaimRequests.mockReset().mockResolvedValue([REQ]);
  acceptClaimRequest.mockReset().mockResolvedValue(REQ);
  rejectClaimRequest.mockReset().mockResolvedValue(REQ);
  refreshUser.mockReset().mockResolvedValue({ coaches: [{ id: 1 }] });
});

async function mount() {
  const n = await renderNative(createElement(ClaimRequests, { variant: "banner" }));
  await n.flush();
  return n;
}

describe("ClaimRequests re-reads /me after an accepted claim (PAD-444)", () => {
  it("refreshes the signed-in user once the claim is accepted", async () => {
    const n = await mount();
    await n.press("claim-accept-5");
    await n.flush();
    expect(acceptClaimRequest).toHaveBeenCalledWith("5");
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it("refreshes nothing on a reject", async () => {
    const n = await mount();
    await n.press("claim-reject-5");
    await n.flush();
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
