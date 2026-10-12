import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/** PAD-642 (players.create rule 10; owner: "forbid under-18"): the coach confirms the student is 18 or
 * older before either save; the confirmation travels with the payload. */
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("@/hooks/useFieldAvailability", () => ({ useFieldAvailability: () => ({ status: "idle" }) }));

import { AddPlayerSheet } from "./AddPlayerSheet";

function mount() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onInvite = vi.fn().mockResolvedValue(undefined);
  render(<AddPlayerSheet open onClose={() => {}} onSave={onSave} onInvite={onInvite} levels={[]} coachId={1} />);
  fireEvent.change(document.getElementById("player-name") as HTMLInputElement, { target: { value: "Ana Adult" } });
  return { onSave, onInvite };
}

describe("AddPlayerSheet — adults only (PAD-642)", () => {
  it("keeps both saves disabled until the coach confirms the student is an adult", () => {
    mount();
    expect(screen.getByRole("button", { name: "players.createPlayer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "players.createAndInvite" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("add-player-confirms-adults"));
    expect(screen.getByRole("button", { name: "players.createPlayer" })).toBeEnabled();
  });

  it("sends confirmsAdults with a save", async () => {
    const { onSave } = mount();
    fireEvent.click(screen.getByTestId("add-player-confirms-adults"));
    fireEvent.click(screen.getByRole("button", { name: "players.createPlayer" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Ana Adult", confirmsAdults: true });
  });

  it("sends confirmsAdults with a create-and-invite", async () => {
    const { onInvite } = mount();
    fireEvent.click(screen.getByTestId("add-player-confirms-adults"));
    fireEvent.click(screen.getByRole("button", { name: "players.createAndInvite" }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(onInvite.mock.calls[0][0]).toMatchObject({ confirmsAdults: true });
  });
});
