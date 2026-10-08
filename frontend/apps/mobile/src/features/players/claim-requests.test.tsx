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
const previewClaimRequest = vi.fn();
vi.mock("@levelup/api", () => ({
  playerClaimsApi: {
    previewClaimRequest: (...a: unknown[]) => previewClaimRequest(...a),
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
  previewClaimRequest.mockReset().mockResolvedValue({ moves: { presences: 2 }, dropped: { presences: 1 }, merged: {} });
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

describe("ClaimRequests shows the dry run before the accept (PAD-528, players.claim rule 5j)", () => {
  it("asks for the preview of each request and renders its lines", async () => {
    const n = await mount();
    await n.flush();
    expect(previewClaimRequest).toHaveBeenCalledWith("5");
    const textOf = (inst: any): string =>
      inst.children.map((c: any) => (typeof c === "string" ? c : textOf(c))).join("");
    const text = textOf(n.byTestId("claim-preview-5"));
    expect(text).toContain("players.claim.previewMovesYours");
    expect(text).toContain("players.claim.previewKeptYours");
    expect(text).toContain("players.claim.previewIrreversible");
  });
});
