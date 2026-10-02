/**
 * PAD-394 (B-157), settings.unsaved-edits rule 2 on ProfileSection.
 *
 * `isProfileUnsaved` (pure function, exported from profile-section.tsx) is the exact
 * "differs by value from the last loaded or saved value" comparison the rule asks for
 * — tested directly. The mount-based tests below prove the WIRING: the section really
 * calls `useUnsavedReporter("profile", isProfileUnsaved(form, saved))` at the right
 * moments (edit, hand-revert, save success, save failure), through the real registry.
 *
 * `expo-router`, `@tanstack/react-query` and `@/auth/AuthContext` are mocked: importing
 * profile-section.tsx unmocked pulls in `expo-router`'s `Stack.tsx` (untranspiled JSX,
 * `SyntaxError: Unexpected token '<'` under vitest — confirmed empirically), and
 * `@tanstack/react-query`'s real hooks hit the two-React-copies crash
 * `competency-manager.test.tsx` (PAD-399) documents, so `useQuery`/`useQueryClient` are
 * replaced with a small homemade shim built on this file's own `react` import (the
 * app's copy, matching `react-test-renderer`'s).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: null, refreshUser: vi.fn() }),
}));

const getMe = vi.fn();
const updateMe = vi.fn();
vi.mock("@levelup/api", () => ({
  authApi: {
    getMe: (...a: unknown[]) => getMe(...a),
    updateMe: (...a: unknown[]) => updateMe(...a),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const React = await import("react");
  return {
    useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
      const [data, setData] = React.useState<unknown>(undefined);
      React.useEffect(() => {
        let alive = true;
        queryFn().then((d) => {
          if (alive) setData(d);
        });
        return () => {
          alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return { data };
    },
    useQueryClient: () => ({ setQueryData: vi.fn(), cancelQueries: vi.fn(async () => undefined) }),
  };
});

let currentT = (key: string) => key;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT }),
}));

vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});

import { isProfileUnsaved, ProfileSection } from "./profile-section";

const ME = {
  name: "Ana",
  abbreviation: "ANA",
  email: "ana@example.com",
  phone: "+351911111111",
  username: "ana",
  roles: ["coach"],
  emailVerification: "verified" as const,
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset();
});

function Capture({ onReady }: { onReady: (r: ReturnType<typeof useUnsavedRegistry>) => void }) {
  onReady(useUnsavedRegistry());
  return null;
}

async function mountProfile(props: { focusEmail?: boolean } = {}) {
  let registry!: ReturnType<typeof useUnsavedRegistry>;
  const n = await renderNative(
    createElement(
      UnsavedRegistryProvider,
      null,
      createElement(Capture, { onReady: (r) => (registry = r) }),
      createElement(ProfileSection, props)
    )
  );
  await n.flush();
  return { n, registry: () => registry };
}

describe("isProfileUnsaved (settings.unsaved-edits rule 2)", () => {
  it("is false when form equals the last loaded/saved value, true the moment a field differs", () => {
    expect(isProfileUnsaved(ME, ME)).toBe(false);
    expect(isProfileUnsaved({ ...ME, phone: "+351999999999" }, ME)).toBe(true);
  });

  it("a hand-revert back to the saved value reads clean — not 'was touched'", () => {
    const edited = { ...ME, phone: "+351999999999" };
    expect(isProfileUnsaved(edited, ME)).toBe(true);
    expect(isProfileUnsaved({ ...edited, phone: ME.phone }, ME)).toBe(false);
  });
});

describe("ProfileSection registers its unsaved state (PAD-394)", () => {
  it("edit -> unsaved; hand-revert -> clean", async () => {
    const { n, registry } = await mountProfile();
    expect(registry().hasUnsaved()).toBe(false);

    await n.changeText("settings-profile-phone", "+351999999999");
    expect(registry().hasUnsaved()).toBe(true);

    await n.changeText("settings-profile-phone", ME.phone);
    expect(registry().hasUnsaved()).toBe(false);
  });

  it("a successful save clears the unsaved flag (the baseline becomes the saved value)", async () => {
    updateMe.mockResolvedValue({ ...ME, phone: "+351999999999" });
    const { n, registry } = await mountProfile();

    await n.changeText("settings-profile-phone", "+351999999999");
    expect(registry().hasUnsaved()).toBe(true);

    await n.press("settings-profile-save");
    await n.flush();
    expect(registry().hasUnsaved()).toBe(false);
  });

  it("a failed save leaves the section unsaved", async () => {
    updateMe.mockRejectedValue(new Error("network"));
    const { n, registry } = await mountProfile();

    await n.changeText("settings-profile-phone", "+351999999999");
    await n.press("settings-profile-save");
    await n.flush();
    expect(registry().hasUnsaved()).toBe(true);
  });
});

// PAD-482 (auth.email-verification rule 14): the coach home's "Adicionar email" opens this section on the
// email field (`focus=email`), and an empty field says why it matters. Same test ids as web.
describe("a coach with no email (PAD-482)", () => {
  it("the field is focused when asked, and the reason shows while it is empty", async () => {
    getMe.mockResolvedValue({ ...ME, email: null, emailVerification: "unverified" });
    const { n } = await mountProfile({ focusEmail: true });

    expect(n.byTestId("settings-profile-email").props.autoFocus).toBe(true);
    expect(n.queryByTestId("settings-profile-email-needed")).not.toBeNull();
  });

  it("a coach with an email sees no reason line, and the field is not focused by default", async () => {
    const { n } = await mountProfile();

    expect(n.byTestId("settings-profile-email").props.autoFocus).toBe(false);
    expect(n.queryByTestId("settings-profile-email-needed")).toBeNull();
  });
});

// B-263 (PAD-482): typing before /auth/me lands used to skip hydration for EVERY field, so a save sent
// `name: ""` and was refused. Only the fields the coach touched keep what they typed.
describe("typing before the profile has loaded (B-263)", () => {
  it("the untouched fields still fill in, and the save sends only the typed one", async () => {
    let land!: (me: object) => void;
    getMe.mockReturnValue(new Promise((resolve) => { land = resolve; }));
    updateMe.mockResolvedValue({ ...ME, email: "rui@example.com", emailVerification: "pending" });
    const { n } = await mountProfile({ focusEmail: true });

    await n.changeText("settings-profile-email", "rui@example.com");
    land({ ...ME, email: null, emailVerification: "unverified" });
    await n.flush();

    expect(n.byTestId("settings-profile-name").props.value).toBe(ME.name);
    expect(n.byTestId("settings-profile-email").props.value).toBe("rui@example.com");
    await n.press("settings-profile-save");
    await n.flush();
    expect(updateMe).toHaveBeenCalledWith({ email: "rui@example.com" });
  });
});

