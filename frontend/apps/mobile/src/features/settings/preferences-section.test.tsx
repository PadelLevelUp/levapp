/**
 * settings.explicit-save (PAD-506) on iOS Preferences: language and request alerts are held until the
 * screen's one Save (stood in for by SectionSaveProbe), which sends one PATCH; a failure keeps the
 * change held and unsaved; the app's language changes only once the server has it.
 *
 * `@tanstack/react-query` is replaced with the small shim profile-section.test.tsx documents (the
 * harness cannot mount the real hooks: two React copies); the rn-primitives Select is a light
 * stand-in that keeps the contract the section relies on (value in, onValueChange({value}) out).
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider, useUnsavedRegistry } from "@/features/settings/unsaved-registry";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/features/settings/coach-levels-section", () => ({ CoachLevelsSection: () => null }));
vi.mock("@/features/evaluations/evaluation-settings-group", () => ({ EvaluationSettingsGroup: () => null }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { roles: ["player"] } }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const changeLanguage = vi.fn();
vi.mock("@/lib/i18n", () => ({ default: { changeLanguage: (...a: unknown[]) => changeLanguage(...a) } }));

const getMe = vi.fn();
const updateMe = vi.fn();
vi.mock("@levelup/api", () => ({
  authApi: {
    getMe: (...a: unknown[]) => getMe(...a),
    updateMe: (...a: unknown[]) => updateMe(...a),
  },
}));

// A react-query stand-in with a real store: setQueryData changes what useQuery returns and re-renders
// its readers, so a test sees what the cache holds after each save (review #497: a plain mock hid
// the iOS rollback defects).
const store = vi.hoisted(() => ({ data: new Map<string, unknown>(), subs: new Set<() => void>() }));
vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");
  const keyOf = (k: unknown) => JSON.stringify(k);
  const notify = () => store.subs.forEach((f) => f());
  const client = {
    getQueryData: (k: unknown) => store.data.get(keyOf(k)),
    setQueryData: (k: unknown, v: unknown) => {
      const key = keyOf(k);
      const next = typeof v === "function" ? (v as (cur: unknown) => unknown)(store.data.get(key)) : v;
      store.data.set(key, next);
      notify();
      return next;
    },
    cancelQueries: async () => undefined,
  };
  return {
    useQueryClient: () => client,
    useQuery: ({ queryKey, queryFn }: { queryKey: unknown; queryFn: () => Promise<unknown> }) => {
      const [, force] = React.useReducer((x: number) => x + 1, 0);
      React.useEffect(() => {
        store.subs.add(force);
        const key = keyOf(queryKey);
        if (!store.data.has(key)) {
          void queryFn().then((d) => {
            if (!store.data.has(key)) { store.data.set(key, d); notify(); }
          });
        }
        return () => { store.subs.delete(force); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { data: store.data.get(keyOf(queryKey)) };
    },
  };
});

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const { Pressable, Text, View } = await import("react-native");
  type Opt = { value: string; label: string };
  const Ctx = React.createContext<{ value?: Opt; onValueChange?: (o: Opt) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: Opt; onValueChange?: (o: Opt) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({ testID, children }: { testID?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(View, { testID, accessibilityValue: { text: ctx.value?.value } }, children);
    },
    SelectValue: () => React.createElement(Text, null, React.useContext(Ctx).value?.value),
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SelectItem: ({ value, label, testID }: Opt & { testID?: string }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(Pressable, { testID, onPress: () => ctx.onValueChange?.({ value, label }) });
    },
  };
});

import { PreferencesSection } from "./preferences-section";

const ME = { language: "en", requestAlerts: true, roles: ["player"] };
const on = (n: Awaited<ReturnType<typeof renderNative>>) => n.byTestId("settings-request-alerts").props.accessibilityState?.checked ?? n.byTestId("settings-request-alerts").props.checked;

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset().mockImplementation(async (patch: object) => ({ ...ME, ...patch }));
  changeLanguage.mockReset();
  store.data.clear();
  store.subs.clear();
  __resetReactNativeMock();
});
afterEach(() => vi.useRealTimers());

let registry!: ReturnType<typeof useUnsavedRegistry>;
function Capture() {
  registry = useUnsavedRegistry();
  return null;
}

async function open() {
  const n = await renderNative(
    <UnsavedRegistryProvider>
      <Capture />
      <PreferencesSection isCoach={false} />
      <SectionSaveProbe testID="settings-preferences-save" />
    </UnsavedRegistryProvider>,
  );
  await n.flush();
  return n;
}
const shownLanguage = (n: Awaited<ReturnType<typeof renderNative>>) =>
  n.byTestId("settings-language-select").props.accessibilityValue.text;

describe("iOS Preferences wait for the one Save (settings.explicit-save)", () => {
  it("choosing a language is held: nothing is sent and the app keeps its language until Save", async () => {
    const n = await open();

    await n.press("settings-language-pt");
    await n.flush();
    expect(shownLanguage(n)).toBe("pt");
    expect(updateMe).not.toHaveBeenCalled();
    expect(changeLanguage).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);

    await n.press("settings-preferences-save");
    await n.flush();
    expect(updateMe).toHaveBeenCalledWith({ language: "pt" });
    expect(changeLanguage).toHaveBeenCalledWith("pt");
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("language and request alerts go in one PATCH", async () => {
    const n = await open();

    await n.toggle("settings-request-alerts");
    await n.press("settings-language-pt");
    await n.flush();
    await n.press("settings-preferences-save");
    await n.flush();

    expect(updateMe).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ language: "pt", requestAlerts: false });
  });

  it("a failed Save keeps the change held and unsaved, and the app keeps its language", async () => {
    const n = await open();
    updateMe.mockRejectedValueOnce(new Error("offline"));

    await n.press("settings-language-pt");
    await n.flush();
    await n.press("settings-preferences-save");
    await n.flush();

    expect(shownLanguage(n)).toBe("pt");
    expect(changeLanguage).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);
  });

  it("a request-alerts change and back is clean", async () => {
    const n = await open();
    expect(on(n)).toBe(true);

    await n.toggle("settings-request-alerts");
    await n.toggle("settings-request-alerts");
    await n.flush();

    expect(on(n)).toBe(true);
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a profile read landing while a language is held does not replace it", async () => {
    const n = await open();

    await n.press("settings-language-pt");
    await n.flush();
    await act(async () => {
      const key = JSON.stringify(["auth-me"]);
      store.data.set(key, { ...(store.data.get(key) as object), language: "en" });
      store.subs.forEach((f) => f());
    });
    await n.flush();

    expect(shownLanguage(n)).toBe("pt");
    expect(registry.hasUnsaved()).toBe(true);
  });
});
