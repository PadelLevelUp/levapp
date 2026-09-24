/**
 * notifications.config rule 14 / 14a (PAD-433, B-168) on the iOS restrictions section.
 *
 * The section is controlled, like web's RestrictionsPanel: it renders `restrictions` and
 * reports each edit through `onChange` with the whole object. The bounds and steps are
 * `@levelup/config`'s RESTRICTION_BOUNDS, the ones web reads. The real `@rn-primitives`
 * switch renders, so `toggle` exercises the same role="switch" contract Maestro taps.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { NotificationRestrictions } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const searchPlayers = vi.fn();
vi.mock("@levelup/api", () => ({
  notificationEngineApi: { searchPlayers: (...a: unknown[]) => searchPlayers(...a) },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});

import { RestrictionsSection } from "./restrictions-section";

const BASE: NotificationRestrictions = {
  maxSimultaneous: { enabled: true, value: 3 },
  maxTotal: { enabled: true, value: 10 },
  maxInactiveTime: { enabled: true, value: 60 },
  minTimeBeforeClass: { enabled: false, value: 30 },
  maxInvitesPerStudentPerDay: { enabled: false, value: 3 },
  quietHours: { enabled: true },
  excludedPlayers: { enabled: true, playerIds: ["42"] },
  excludeUnpaidSubscription: { enabled: false },
  cancellationDeadlineHours: 24,
};

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

async function mount(over: Partial<NotificationRestrictions> = {}, names: Record<string, string> = {}, disabled = false) {
  const onChange = vi.fn();
  const n = await renderNative(
    createElement(RestrictionsSection, {
      restrictions: { ...BASE, ...over },
      excludedPlayerNames: names,
      onChange,
      disabled,
    })
  );
  return { n, onChange };
}

beforeEach(() => {
  searchPlayers.mockReset().mockResolvedValue({ players: [] });
});

const ROWS = [
  "maxSimultaneous",
  "maxTotal",
  "maxInactiveTime",
  "minTimeBeforeClass",
  "maxInvitesPerStudentPerDay",
  "quietHours",
  "excludedPlayers",
  "excludeUnpaidSubscription",
  "cancellationDeadlineHours",
];

describe("iOS shows the same nine restriction controls as web (PAD-433)", () => {
  it("renders every row of rule 14, in web's order", async () => {
    const { n } = await mount();
    const order = n.root.root
      .findAll((x) => typeof x.type === "string" && typeof x.props.testID === "string" && /^restriction-row-/.test(x.props.testID))
      .map((x) => x.props.testID.replace("restriction-row-", ""));
    expect(order).toEqual(ROWS);
  });

  it("shows the stored values and switch states", async () => {
    const { n } = await mount();
    expect(text(n.byTestId("restriction-maxSimultaneous-value"))).toBe("3");
    expect(text(n.byTestId("restriction-maxTotal-value"))).toBe("10");
    expect(text(n.byTestId("restriction-cancellationDeadlineHours-value"))).toBe("24");
    expect(n.byTestId("restriction-quietHours-toggle").props["aria-checked"]).toBe(true);
    expect(n.byTestId("restriction-excludeUnpaidSubscription-toggle").props["aria-checked"]).toBe(false);
  });

  it("hides the value of a stepper whose restriction is off, as web does", async () => {
    const { n } = await mount();
    expect(n.queryByTestId("restriction-minTimeBeforeClass-value")).toBeNull();
    expect(n.queryByTestId("restriction-maxSimultaneous-value")).not.toBeNull();
  });

  it("uses the maxTotal 'per class' copy (PAD-432)", async () => {
    const { n } = await mount();
    expect(text(n.byTestId("restriction-row-maxTotal"))).toContain("settings.restrictions.maxTotal");
    expect(text(n.byTestId("restriction-row-maxTotal"))).toContain("settings.restrictions.maxTotalDescription");
  });
});

describe("edits report the whole restrictions object (PAD-433)", () => {
  it("a + steps by the key's step", async () => {
    const { n, onChange } = await mount();
    await n.press("restriction-maxInactiveTime-dec");
    expect(onChange).toHaveBeenCalledWith({ ...BASE, maxInactiveTime: { enabled: true, value: 45 } });
    await n.press("restriction-maxSimultaneous-inc");
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, maxSimultaneous: { enabled: true, value: 4 } });
  });

  it("a switch flips only its own enabled flag", async () => {
    const { n, onChange } = await mount();
    await n.toggle("restriction-quietHours-toggle");
    expect(onChange).toHaveBeenCalledWith({ ...BASE, quietHours: { enabled: false } });
  });

  it("the cancellation deadline is a plain scalar", async () => {
    const { n, onChange } = await mount();
    await n.press("restriction-cancellationDeadlineHours-inc");
    expect(onChange).toHaveBeenCalledWith({ ...BASE, cancellationDeadlineHours: 25 });
  });
});

describe("a step clamps at the shared bounds (PAD-433)", () => {
  it("disables the button at a bound", async () => {
    const { n } = await mount({
      maxSimultaneous: { enabled: true, value: 20 },
      maxInactiveTime: { enabled: true, value: 15 },
      cancellationDeadlineHours: 0,
    });
    expect(n.byTestId("restriction-maxSimultaneous-inc").props.disabled).toBe(true);
    expect(n.byTestId("restriction-maxSimultaneous-dec").props.disabled).toBe(false);
    expect(n.byTestId("restriction-maxInactiveTime-dec").props.disabled).toBe(true);
    expect(n.byTestId("restriction-cancellationDeadlineHours-dec").props.disabled).toBe(true);
  });

  it("never reports a value past the bound", async () => {
    const { n, onChange } = await mount({ maxSimultaneous: { enabled: true, value: 20 } });
    await n.press("restriction-maxSimultaneous-inc");
    for (const [arg] of onChange.mock.calls) {
      expect((arg as NotificationRestrictions).maxSimultaneous.value).toBeLessThanOrEqual(20);
    }
  });
});

describe("excluded players are named (PAD-433, B-168)", () => {
  it("names a saved player from excludedPlayerNames, not the id", async () => {
    const { n } = await mount({}, { "42": "Alice Andrade" });
    expect(text(n.byTestId("restriction-excluded-chip-42"))).toBe("Alice Andrade");
  });

  it("falls back to the id for a player the coach no longer has", async () => {
    const { n } = await mount({ excludedPlayers: { enabled: true, playerIds: ["7"] } }, {});
    expect(text(n.byTestId("restriction-excluded-chip-7"))).toBe("7");
  });

  it("adds a searched player with its name and removes one", async () => {
    searchPlayers.mockResolvedValue({ players: [{ id: "42", name: "Alice Andrade" }, { id: "9", name: "Alberto Basto" }] });
    const { n, onChange } = await mount({}, { "42": "Alice Andrade" });
    await n.changeText("restriction-excluded-search", "al");
    await new Promise((r) => setTimeout(r, 350));
    await n.flush();
    // already-excluded players are not offered again
    expect(n.queryByTestId("restriction-excluded-result-42")).toBeNull();
    await n.press("restriction-excluded-result-9");
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, excludedPlayers: { enabled: true, playerIds: ["42", "9"] } });

    await n.press("restriction-excluded-remove-42");
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, excludedPlayers: { enabled: true, playerIds: [] } });
  });
});

describe("the engine switched off disables the section, as on web (PAD-433)", () => {
  it("marks every switch and stepper disabled", async () => {
    const { n } = await mount({}, {}, true);
    expect(n.byTestId("restriction-quietHours-toggle").props.disabled).toBe(true);
    expect(n.byTestId("restriction-maxSimultaneous-inc").props.disabled).toBe(true);
    expect(n.byTestId("restriction-cancellationDeadlineHours-dec").props.disabled).toBe(true);
  });
});
