/**
 * settings.save-on-change (PAD-473) on iOS Preferences: language and request alerts sign their saves
 * with the shared sign, a failure says so and returns to what the server holds, and the language
 * sign's text keeps the `settings-language-status` id Maestro flows 12 and 95 assert.
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
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const texts = (n: Awaited<ReturnType<typeof renderNative>>, id: string) =>
  n.byTestId(id).findAll((x) => typeof x.props.children === "string").map((x) => x.props.children).join("");

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset().mockImplementation(async (patch: object) => ({ ...ME, ...patch }));
  changeLanguage.mockReset();
  store.data.clear();
  store.subs.clear();
  __resetReactNativeMock();
});
afterEach(() => vi.useRealTimers());

async function open() {
  const n = await renderNative(<PreferencesSection isCoach={false} />);
  await n.flush();
  return n;
}

describe("iOS Preferences save on change (settings.save-on-change)", () => {
  it("choosing a language saves it, applies it, and signs it with the text Maestro asserts", async () => {
    const n = await open();
    expect(n.queryByTestId("settings-language-status")).toBeNull();

    await n.press("settings-language-pt");
    await n.flush();
    expect(updateMe).toHaveBeenCalledWith({ language: "pt" });
    expect(changeLanguage).toHaveBeenCalledWith("pt");

    await wait(700);
    expect(n.queryByTestId("settings-language-status")).not.toBeNull();
    expect(texts(n, "settings-language-sign")).toContain("settings.saveSign.saved");
  });

  it("a failed language save says so and shows the language the server holds", async () => {
    const n = await open();
    updateMe.mockRejectedValueOnce(new Error("offline"));

    await n.press("settings-language-pt");
    await n.flush();

    expect(texts(n, "settings-language-sign")).toContain("settings.saveSign.failed");
    expect(n.byTestId("settings-language-select").props.accessibilityValue.text).toBe("en");
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it("request alerts sign their save; a failure says so and puts the server's value back", async () => {
    const n = await open();

    await n.toggle("settings-request-alerts");
    await n.flush();
    await wait(700);
    expect(texts(n, "settings-request-alerts-sign")).toContain("settings.saveSign.saved");

    updateMe.mockRejectedValueOnce(new Error("offline"));
    await n.toggle("settings-request-alerts");
    await n.flush();
    expect(texts(n, "settings-request-alerts-sign")).toContain("settings.saveSign.failed");
    expect(on(n)).toBe(false); // back to what the server confirmed (off, from the first save)
  });

  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it("review #497: request alerts — off (A) then on (B), both fail: the switch shows on, what the server holds", async () => {
    const n = await open();
    expect(on(n)).toBe(true);
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    updateMe.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    await n.toggle("settings-request-alerts"); // A: off
    await n.flush();
    await n.toggle("settings-request-alerts"); // B: on, started from off
    await n.flush();
    await act(async () => { a.reject(new Error("a")); });
    await act(async () => { b.reject(new Error("b")); });
    await n.flush();

    expect(on(n)).toBe(true);
  });

  it("review #497: language — an older save confirmed while the newest is out, then the newest fails: shows the confirmed language", async () => {
    const n = await open();
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    updateMe.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    await n.press("settings-language-pt"); // A
    await n.flush();
    await n.press("settings-language-en"); // B, the newest
    await n.flush();
    await act(async () => { a.resolve({ ...ME, language: "pt" }); }); // the server now holds pt
    await n.flush();
    await act(async () => { b.reject(new Error("b")); });
    await n.flush();

    expect(n.byTestId("settings-language-select").props.accessibilityValue.text).toBe("pt");
  });

  it("rule 3: language — two held saves both fail, back to the confirmed language (not the one the last started from)", async () => {
    const n = await open();
    const y = deferred<unknown>();
    const z = deferred<unknown>();
    updateMe.mockReturnValueOnce(y.promise).mockReturnValueOnce(z.promise);

    await n.press("settings-language-pt"); // Y
    await n.flush();
    await n.press("settings-language-en"); // Z, started from pt
    await n.flush();
    await act(async () => { y.reject(new Error("y")); });
    await act(async () => { z.reject(new Error("z")); });
    await n.flush();

    expect(n.byTestId("settings-language-select").props.accessibilityValue.text).toBe("en");
  });

  it("rule 3: one request-alerts save in flight — a change made meanwhile is sent when it returns", async () => {
    const n = await open();
    const a = deferred<unknown>();
    updateMe.mockReturnValueOnce(a.promise);

    await n.toggle("settings-request-alerts"); // off — sent
    await n.flush();
    await n.toggle("settings-request-alerts"); // on — waits
    await n.flush();
    expect(updateMe).toHaveBeenCalledTimes(1);
    await act(async () => { a.resolve({ ...ME, requestAlerts: false }); });
    await n.flush();

    expect(updateMe).toHaveBeenCalledTimes(2);
    expect(updateMe).toHaveBeenLastCalledWith({ requestAlerts: true });
  });
});
