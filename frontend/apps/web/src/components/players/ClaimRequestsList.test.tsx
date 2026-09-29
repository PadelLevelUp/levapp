/**
 * players.join-token rule 8a (PAD-444, B-197) on web: accepting a coach's claim links the student,
 * so the client re-reads /me (the "No coach yet?" prompt reads it); a reject refreshes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listMyClaimRequests = vi.fn();
const acceptClaimRequest = vi.fn();
const rejectClaimRequest = vi.fn();
vi.mock("@/api/playerClaims", () => ({
  listMyClaimRequests: (...a: unknown[]) => listMyClaimRequests(...a),
  acceptClaimRequest: (...a: unknown[]) => acceptClaimRequest(...a),
  rejectClaimRequest: (...a: unknown[]) => rejectClaimRequest(...a),
}));
const refreshUser = vi.fn();
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ refreshUser }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ClaimRequestsList } from "./ClaimRequestsList";

const REQ = { id: "5", coachName: "Maria", clubName: "Padel Norte", placeholderName: "Ana S." };

beforeEach(() => {
  listMyClaimRequests.mockReset().mockResolvedValue([REQ]);
  acceptClaimRequest.mockReset().mockResolvedValue(REQ);
  rejectClaimRequest.mockReset().mockResolvedValue(REQ);
  refreshUser.mockReset().mockResolvedValue({ coaches: [{ id: 1 }] });
});

describe("ClaimRequestsList re-reads /me after an accepted claim (PAD-444)", () => {
  it("refreshes the signed-in user once the claim is accepted", async () => {
    render(<ClaimRequestsList variant="banner" />);
    fireEvent.click(await screen.findByTestId("claim-accept-5"));
    await waitFor(() => expect(acceptClaimRequest).toHaveBeenCalledWith("5"));
    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
  });

  it("refreshes nothing on a reject", async () => {
    render(<ClaimRequestsList variant="banner" />);
    fireEvent.click(await screen.findByTestId("claim-reject-5"));
    await waitFor(() => expect(rejectClaimRequest).toHaveBeenCalled());
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
