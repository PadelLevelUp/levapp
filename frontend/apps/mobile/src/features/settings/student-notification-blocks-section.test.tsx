/**
 * PAD-394 (B-157), settings.unsaved-edits rule 2 on StudentNotificationBlocksSection.
 *
 * `isNotifBlocksUnsaved` (pure, exported from the section) is the "differs by value
 * from the last loaded or saved value" comparison rule 2 asks for. The mount tests
 * prove the section really calls `useUnsavedReporter` with it at the right moments,
 * through the real registry and the section's own switches/textarea (all carry stable
 * testIDs, so a full edit/revert/save walk is practical here, unlike coach-levels).
 *
 * `@tanstack/react-query`'s real hooks hit the two-React-copies crash
 * `competency-manager.test.tsx` (PAD-399) documents, so `useQuery`/`useQueryClient` are
 * replaced with the same small shim `profile-section.test.tsx` uses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";

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
      return { data, isPending: data === undefined };
    },
    useQueryClient: () => ({ setQueryData: vi.fn() }),
  };
});

let currentT = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: currentT }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/textarea", async () => {
  const { TextInput } = await import("react-native");
  return {
    Textarea: (p: { testID: string; value: string; onChangeText: (v: string) => void }) =>
      createElement(TextInput, { testID: p.testID, value: p.value, onChangeText: p.onChangeText }),
  };
});

import { isNotifBlocksUnsaved, StudentNotificationBlocksSection } from "./student-notification-blocks-section";

const ME = {
  blockAutoInvitations: false,
  blockManualInvitations: false,
  blockAllNotifications: false,
  notificationBlockReason: "",
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset();
});

function Capture({ onReady }: { onReady: (r: ReturnType<typeof useUnsavedRegistry>) => void }) {
  onReady(useUnsavedRegistry());
  return null;
}

async function mount() {
  let registry!: ReturnType<typeof useUnsavedRegistry>;
  const n = await renderNative(
    createElement(
      UnsavedRegistryProvider,
      null,
      createElement(Capture, { onReady: (r) => (registry = r) }),
      createElement(StudentNotificationBlocksSection)
    )
  );
  await n.flush();
  return { n, registry: () => registry };
}

describe("isNotifBlocksUnsaved (settings.unsaved-edits rule 2)", () => {
  const BASE = { blockAuto: false, blockManual: true, blockAll: false, reason: "travel" };

  it("is false when equal, true the moment any field differs", () => {
    expect(isNotifBlocksUnsaved(BASE, BASE)).toBe(false);
    expect(isNotifBlocksUnsaved({ ...BASE, blockAuto: true }, BASE)).toBe(true);
    expect(isNotifBlocksUnsaved({ ...BASE, reason: "" }, BASE)).toBe(true);
  });

  it("a hand-revert back to the saved value reads clean", () => {
    const edited = { ...BASE, blockAll: true };
    expect(isNotifBlocksUnsaved(edited, BASE)).toBe(true);
    expect(isNotifBlocksUnsaved({ ...edited, blockAll: BASE.blockAll }, BASE)).toBe(false);
  });
});

describe("StudentNotificationBlocksSection registers its unsaved state (PAD-394)", () => {
  it("toggling a switch -> unsaved; toggling it back -> clean", async () => {
    const { n, registry } = await mount();
    expect(registry().hasUnsaved()).toBe(false);

    await n.toggle("student-notif-block-manual");
    expect(registry().hasUnsaved()).toBe(true);

    await n.toggle("student-notif-block-manual");
    expect(registry().hasUnsaved()).toBe(false);
  });

  it("editing the reason text is unsaved", async () => {
    const { n, registry } = await mount();
    await n.changeText("student-notif-reason", "Injury recovery");
    expect(registry().hasUnsaved()).toBe(true);
  });

  it("a successful save clears the unsaved flag", async () => {
    updateMe.mockResolvedValue({ ...ME, blockManualInvitations: true });
    const { n, registry } = await mount();

    await n.toggle("student-notif-block-manual");
    expect(registry().hasUnsaved()).toBe(true);

    await n.press("student-notif-save");
    await n.flush();
    expect(registry().hasUnsaved()).toBe(false);
  });

  it("a failed save leaves the section unsaved", async () => {
    updateMe.mockRejectedValue(new Error("network"));
    const { n, registry } = await mount();

    await n.toggle("student-notif-block-manual");
    await n.press("student-notif-save");
    await n.flush();
    expect(registry().hasUnsaved()).toBe(true);
  });
});
