/**
 * players.profile rules 8, 9, 11 (PAD-834): the needs-configuring and pending-registration states.
 * Pending is `pendingRegistration`, never `!isActive` or `!validated`: a Google/Apple student is
 * active with no password, and an inactive user with a password has an account.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { CoachPlayer } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@/lib/publicWebLink", () => ({
  usePublicWebOrigin: () => "https://levapp.app",
  publicWebLink: (origin: string, path: string) => `${origin}${path}`,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/players/detail/ClaimLinkAction", () => ({
  ClaimLinkAction: ({ player }: { player: CoachPlayer }) =>
    player.claimable ? <div data-testid="claim-link-action" /> : null,
}));

import { PlayerStateAlerts } from "./PlayerStateAlerts";
import { PlayerHeader } from "./PlayerHeader";
import { PlayerInfoBlock } from "./PlayerInfoBlock";

const base = {
  id: "cp", coachId: "1", playerId: "1", userId: "10", name: "X", email: "x@example.pt",
  isActive: true, validated: true, levelId: "L1", side: "left", level: { id: "L1", coachId: "1", code: "I1", label: "Iniciação" },
  pendingRegistration: false, addedAt: null,
} as unknown as CoachPlayer;
const player = (over: Partial<CoachPlayer>) => ({ ...base, ...over }) as CoachPlayer;

const header = (p: CoachPlayer) =>
  render(
    <PlayerHeader
      player={p} levels={[]} isEditing={false} draftName="" draftNickname="" draftNicknameAsName={false}
      onDraftNicknameChange={() => {}} onDraftNicknameAsNameChange={() => {}} onDraftNameChange={() => {}}
      onSave={() => {}} onCancel={() => {}}
    />,
  );

describe("PlayerStateAlerts (PAD-834)", () => {
  it("[PLAYERS-PROFILE-13] the alert text follows exactly what is missing", () => {
    const cases: Array<[Partial<CoachPlayer>, string, string]> = [
      [{ levelId: undefined, level: undefined }, "players.card.missingLevel", "level"],
      [{ side: undefined }, "players.card.missingSide", "side"],
      [{ levelId: undefined, level: undefined, side: undefined }, "players.card.missingBoth", "level,side"],
    ];
    for (const [over, key, missing] of cases) {
      const onComplete = vi.fn();
      const { unmount } = render(<PlayerStateAlerts player={player(over)} onComplete={onComplete} />);
      const alert = screen.getByTestId("player-needs-config-alert");
      expect(alert).toHaveAttribute("data-missing", missing);
      expect(within(alert).getByText(key)).toBeInTheDocument();
      // The alert holds no select: its one control opens Block 1.
      expect(alert.querySelector("select, [role='combobox']")).toBeNull();
      fireEvent.click(screen.getByTestId("player-needs-config-complete"));
      expect(onComplete).toHaveBeenCalledTimes(1);
      unmount();

      const chips = header(player(over));
      expect(!!screen.queryByTestId("player-chip-no-level")).toBe(missing.includes("level"));
      expect(!!screen.queryByTestId("player-chip-no-side")).toBe(missing.includes("side"));
      chips.unmount();
    }
    // A configured player shows neither alert nor chips; the button waits while an edit is open.
    const { container } = render(<PlayerStateAlerts player={base} onComplete={() => {}} />);
    expect(container.innerHTML).toBe("");
    render(<PlayerStateAlerts player={player({ side: undefined })} onComplete={() => {}} completeDisabled />);
    expect(screen.getByTestId("player-needs-config-complete")).toBeDisabled();
  });

  it("[PLAYERS-PROFILE-15] the pending state and the e-mail lock follow pendingRegistration, not isActive or validated", () => {
    const google = player({ isActive: true, validated: false, pendingRegistration: false });
    const halfRegistered = player({ isActive: false, validated: true, pendingRegistration: false });
    const placeholder = player({
      isActive: false, validated: false, pendingRegistration: true, email: "",
      activationToken: "tok", addedAt: new Date().toISOString(), claimable: true,
    });

    for (const p of [google, halfRegistered]) {
      const a = render(<PlayerStateAlerts player={p} onComplete={() => {}} />);
      expect(screen.queryByTestId("player-pending-alert")).toBeNull();
      a.unmount();
      const h = header(p);
      expect(screen.queryByTestId("player-chip-pending")).toBeNull();
      h.unmount();
    }
    const h = header(halfRegistered);
    expect(screen.getByTestId("player-chip-inactive")).toBeInTheDocument();
    h.unmount();

    render(<PlayerStateAlerts player={placeholder} onComplete={() => {}} />);
    const alert = screen.getByTestId("player-pending-alert");
    expect(within(alert).getByTestId("player-copy-invite-link")).toBeInTheDocument();
    expect(within(alert).getByTestId("claim-link-action")).toBeInTheDocument();
    expect(within(alert).getByTestId("player-pending-age")).toHaveAttribute("data-days", "0");
    header(placeholder);
    expect(screen.getByTestId("player-chip-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("player-chip-inactive")).toBeNull();

    // Block 1: only the placeholder's e-mail is a box; its empty e-mail reads "Preenchido no registo".
    const edit = (p: CoachPlayer) =>
      render(
        <PlayerInfoBlock player={p} levels={[]} session="edit" onEdit={() => {}} onCancel={() => {}} onSave={async () => {}} />,
      );
    for (const p of [google, halfRegistered]) {
      const r = edit(p);
      expect(screen.queryByTestId("player-info-email-input")).toBeNull();
      r.unmount();
    }
    const r = edit(placeholder);
    expect(screen.getByTestId("player-info-email-input")).toBeInTheDocument();
    r.unmount();
    render(<PlayerInfoBlock player={placeholder} levels={[]} session={null} onEdit={() => {}} onCancel={() => {}} onSave={async () => {}} />);
    expect(screen.getByTestId("player-info-email")).toHaveTextContent("players.card.emailAtRegistration");
  });
});
