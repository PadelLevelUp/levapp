/** Test fixture (PAD-839): a `SetupGuide` built by the real `setupGuideState`, with spy writes. */
import { vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { setupGuideState, type DeviceStepState, type SetupGuideMe } from "@levelup/config";
import type { SetupGuide } from "./useSetupGuide";

export const STUDENT_ME = {
  roles: ["student"],
  requestAlerts: true,
  coaches: [{ id: 1 }],
  setupGuide: { snoozedAt: null, hidden: false, readyClosed: false, alwaysAvailable: false, alertsConfirmed: false },
} satisfies SetupGuideMe;

type Input = Parameters<typeof setupGuideState>[0];

export function makeGuide(
  input: Partial<Input> & { incompleteCoaches?: SetupGuide["incompleteCoaches"] } = {}
): SetupGuide & { write: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } {
  const { incompleteCoaches = [], ...rest } = input;
  const device: DeviceStepState | undefined = "device" in rest ? rest.device : "ask";
  const view = setupGuideState({
    me: STUDENT_ME,
    blockers: [],
    profileIncomplete: incompleteCoaches.length ? { coaches: incompleteCoaches } : null,
    ...rest,
    device,
  });
  return {
    view,
    device,
    incompleteCoaches,
    write: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(false),
  };
}

/** `@testing-library/user-event` is not installed in this workspace: a minimal click/keyboard shim over fireEvent. */
export const userEvent = {
  setup: (_options?: unknown) => ({
    click: async (el: Element) => {
      fireEvent.click(el);
    },
    keyboard: async (keys: string) => {
      if (keys === "{Escape}") fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      else throw new Error(`unsupported key ${keys}`);
    },
  }),
};
