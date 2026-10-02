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

const queryClient = vi.hoisted(() => ({ setQueryData: vi.fn(), cancelQueries: vi.fn(async () => undefined) }));
vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");
  return {
    useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
      const [data, setData] = React.useState<unknown>(undefined);
      React.useEffect(() => {
        let alive = true;
        queryFn().then((d) => { if (alive) setData(d); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { data };
    },
    useQueryClient: () => queryClient,
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
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const texts = (n: Awaited<ReturnType<typeof renderNative>>, id: string) =>
  n.byTestId(id).findAll((x) => typeof x.props.children === "string").map((x) => x.props.children).join("");

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset().mockImplementation(async (patch: object) => ({ ...ME, ...patch }));
  changeLanguage.mockReset();
  queryClient.setQueryData.mockReset();
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
    expect(queryClient.setQueryData).toHaveBeenLastCalledWith(["auth-me"], ME);
  });
});
