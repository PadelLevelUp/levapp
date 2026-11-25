/**
 * auth.invite-welcome (UI idea 8): the join page, the coach invitation and the player invitation open on a navy band
 * that holds each state's title and description; one card below holds what the card held under them. `t` returns the key
 * and, when it is given values, the values, so a test sees which facts a string carries.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = vi.hoisted(() => ({
  user: null as null | { roles: string[]; name?: string },
  isAuthenticated: false,
}));
const joinPreview = vi.hoisted(() => vi.fn());
const joinAccept = vi.hoisted(() => vi.fn());
const coachInvitation = vi.hoisted(() => vi.fn());
const playerInvitation = vi.hoisted(() => vi.fn());
const playerClaim = vi.hoisted(() => vi.fn());

vi.mock("@/api/joinTokens", () => ({
  previewJoinToken: (...a: unknown[]) => joinPreview(...a),
  acceptJoinToken: (...a: unknown[]) => joinAccept(...a),
}));
vi.mock("@/api/invitations", () => ({
  getCoachInvitation: (...a: unknown[]) => coachInvitation(...a),
  acceptCoachInvitation: vi.fn(),
}));
vi.mock("@/api/playerInvitations", () => ({
  getPlayerInvitation: (...a: unknown[]) => playerInvitation(...a),
  acceptPlayerInvitation: vi.fn(),
  claimPlayerInvitation: (...a: unknown[]) => playerClaim(...a),
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: false,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}|${Object.values(values).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));

import JoinCoachPage from "./JoinCoachPage";
import CoachInvitePage from "./CoachInvitePage";
import PlayerInvitePage from "./PlayerInvitePage";

const PREVIEW = { coachName: "Coach Name", clubName: "Club Name", clubLogoUrl: "https://cdn.test/logo.png" };

function mount(path: string, route: string, page: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={page} />
      </Routes>
    </MemoryRouter>
  );
}
const band = () => screen.getByTestId("invite-band");
/** The band holds the title as a heading of the level it has today (3) and the description. */
function expectBand(title: string, description: string) {
  const b = band();
  const heading = within(b).getByRole("heading", { level: 3 });
  expect(heading).toHaveTextContent(title);
  expect(b).toHaveTextContent(description);
  // The first heading of the page.
  expect(screen.getAllByRole("heading")[0]).toBe(heading);
}

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  joinPreview.mockReset().mockResolvedValue(PREVIEW);
  joinAccept.mockReset().mockResolvedValue({ coachName: "Coach Name", clubName: "Club Name", alreadyMember: false });
  coachInvitation.mockReset().mockResolvedValue({ clubName: "Club Name" });
  playerInvitation.mockReset().mockResolvedValue({ playerName: "Ana" });
  playerClaim.mockReset().mockResolvedValue({ coachName: "Coach Name" });
});

describe("the invite pages' band (auth.invite-welcome rules 2-4)", () => {
  it("[AUTH-INVITE-WELCOME-1] every state shows its words on the band and keeps its controls", async () => {
    // Join, signed out: the coach's and the club's name, the state's words, the two actions in the state's own id.
    mount("/join/coach/tok", "/join/coach/:token", <JoinCoachPage />);
    const signedOut = await screen.findByTestId("join-coach-signed-out");
    expectBand("players.joinCoach.signInTitle|Coach Name", "players.joinCoach.signInDescription");
    expect(band()).toHaveTextContent("Coach Name");
    expect(band()).toHaveTextContent("Club Name");
    expect(within(signedOut).getByTestId("join-coach-create-account")).toBeTruthy();
    expect(within(signedOut).getByTestId("join-coach-sign-in")).toBeTruthy();
    expect(signedOut).not.toHaveTextContent("players.joinCoach.signInTitle");
    expect(screen.getByTestId("invite-band").contains(signedOut)).toBe(false);
    document.body.innerHTML = "";

    // Join, preview (signed in as a student): the club's logo beside the names, confirm and the way out.
    auth.isAuthenticated = true;
    auth.user = { roles: ["player"] };
    mount("/join/coach/tok", "/join/coach/:token", <JoinCoachPage />);
    const preview = await screen.findByTestId("join-coach-preview");
    expectBand("players.joinCoach.prompt|Coach Name|Club Name", "players.joinCoach.explain|Coach Name");
    expect(band()).toHaveTextContent("Club Name");
    expect(band().querySelector(`img[src="${PREVIEW.clubLogoUrl}"]`)).not.toBeNull();
    expect(within(preview).getByTestId("join-coach-confirm")).toBeTruthy();
    fireEvent.click(within(preview).getByTestId("join-coach-confirm"));

    // Join, joined.
    const joined = await screen.findByTestId("join-coach-success");
    expectBand("players.joinCoach.successTitle|Coach Name", "players.joinCoach.successDescription|Coach Name|Club Name");
    expect(within(joined).getByTestId("join-coach-go-calendar")).toBeTruthy();
    document.body.innerHTML = "";

    // Join, a coach opens the link.
    auth.user = { roles: ["coach"] };
    mount("/join/coach/tok", "/join/coach/:token", <JoinCoachPage />);
    const isCoach = await screen.findByTestId("join-coach-is-coach");
    expectBand("players.joinCoach.coachTitle", "players.joinCoach.coachDescription");
    expect(isCoach.querySelector("a,button")).toBeTruthy();
    document.body.innerHTML = "";

    // The coach invitation.
    auth.user = null;
    auth.isAuthenticated = false;
    mount("/invite/coach/tok", "/invite/coach/:token", <CoachInvitePage />);
    await screen.findByLabelText("auth.coachInvite.email");
    // Point (b): the pt pages say tu (the key carries a Tu suffix).
    expectBand("auth.coachInvite.titleTu|Club Name", "auth.coachInvite.descriptionTu");
    expect(screen.getByTestId("coachInvite-country")).toBeTruthy();
    expect(band().contains(screen.getByTestId("coachInvite-country"))).toBe(false);
    document.body.innerHTML = "";

    // The player invitation: the form, then (signed in) the claim, a coach, and the claimed state.
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    await screen.findByLabelText("auth.playerInvite.birthDate");
    expectBand("auth.playerInvite.titleTu|Ana", "auth.playerInvite.descriptionTu");
    expect(screen.getByTestId("invite-claim-signin")).toBeTruthy();
    document.body.innerHTML = "";

    auth.isAuthenticated = true;
    auth.user = { roles: ["player"], name: "Ana" };
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    const claim = await screen.findByTestId("invite-claim");
    expectBand("auth.playerInvite.claimTitle", "auth.playerInvite.claimDescription|Ana");
    fireEvent.click(within(claim).getByTestId("invite-claim-confirm"));
    const claimed = await screen.findByTestId("invite-claim-success");
    expectBand("auth.playerInvite.claimSuccessTitle", "auth.playerInvite.claimSuccessDescription|Coach Name");
    expect(within(claimed).getByTestId("invite-claim-go-dashboard")).toBeTruthy();
    document.body.innerHTML = "";

    auth.user = { roles: ["coach"] };
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    await screen.findByTestId("invite-claim-is-coach");
    expectBand("auth.playerInvite.claimIsCoachTitle", "auth.playerInvite.claimIsCoachDescription");
  });

  it("[AUTH-INVITE-WELCOME-1] loading and invalid render as today, with no band", async () => {
    joinPreview.mockRejectedValue(new Error("404"));
    mount("/join/coach/tok", "/join/coach/:token", <JoinCoachPage />);
    await screen.findByTestId("join-coach-invalid");
    expect(screen.queryByTestId("invite-band")).toBeNull();
    document.body.innerHTML = "";

    coachInvitation.mockRejectedValue(new Error("404"));
    mount("/invite/coach/tok", "/invite/coach/:token", <CoachInvitePage />);
    await screen.findByText("auth.coachInvite.invalidTitle");
    expect(screen.queryByTestId("invite-band")).toBeNull();
    document.body.innerHTML = "";

    playerInvitation.mockRejectedValue(new Error("410"));
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    await screen.findByText("auth.playerInvite.invalidTitle");
    expect(screen.queryByTestId("invite-band")).toBeNull();
  });

  it("[AUTH-INVITE-WELCOME-3] the signed-out pages reveal only the listed facts", async () => {
    // A sentinel in every field, including the ones no page shows.
    joinPreview.mockResolvedValue({ ...PREVIEW, coachEmail: "LEAK-coach-email", coachUsername: "LEAK-coach-user", clubId: "LEAK-club-id" });
    mount("/join/coach/tok", "/join/coach/:token", <JoinCoachPage />);
    await screen.findByTestId("join-coach-signed-out");
    let text = document.body.textContent ?? "";
    expect(text).toContain("Coach Name");
    expect(text).toContain("Club Name");
    expect(text).not.toMatch(/LEAK/);
    // Signed out shows no club logo.
    expect(document.querySelector(`img[src="${PREVIEW.clubLogoUrl}"]`)).toBeNull();
    document.body.innerHTML = "";

    coachInvitation.mockResolvedValue({ clubName: "Club Name", inviterName: "LEAK-inviter", coachEmail: "LEAK-email" });
    mount("/invite/coach/tok", "/invite/coach/:token", <CoachInvitePage />);
    await screen.findByLabelText("auth.coachInvite.email");
    text = document.body.textContent ?? "";
    expect(text).toContain("Club Name");
    expect(text).not.toMatch(/LEAK/);
    document.body.innerHTML = "";

    // Point (a), on the owner's pick (INVITE_NAMES_INVITER): the names show when the preview carries them; no other
    // field does. Today's preview carries only the player's name, so nothing is added until the backend sends them.
    playerInvitation.mockResolvedValue({ playerName: "Ana", email: "LEAK-email", token: "LEAK-token" });
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    await screen.findByLabelText("auth.playerInvite.birthDate");
    text = document.body.textContent ?? "";
    expect(text).toContain("Ana");
    expect(text).not.toMatch(/LEAK/);
    document.body.innerHTML = "";

    playerInvitation.mockResolvedValue({ playerName: "Ana", coachName: "Coach Name", clubName: "Club Name", email: "LEAK-email" });
    mount("/invite/player/tok", "/invite/player/:token", <PlayerInvitePage />);
    await screen.findByLabelText("auth.playerInvite.birthDate");
    expect(band()).toHaveTextContent("Coach Name");
    expect(band()).toHaveTextContent("Club Name");
    expect(document.body.textContent).not.toMatch(/LEAK/);
  });
});
