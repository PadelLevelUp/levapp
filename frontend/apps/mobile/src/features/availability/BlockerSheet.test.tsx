/** calendar.student-blockers rule 26, criterion -32 (PAD-772) on iOS: the block form says, before the save, that classes in the period are marked. */
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/time-picker-input", () => ({ TimePickerInput: () => null }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));

import { BlockerSheet } from "./BlockerSheet";

const text = (node: unknown): string => {
  const n = node as { children?: unknown[] } | string | null;
  if (n === null || n === undefined) return "";
  if (typeof n === "string") return n;
  return (n.children ?? []).map(text).join("");
};

describe("the iOS block sheet (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-32] the blocker form says classes in the period are marked", async () => {
    const onSubmit = vi.fn();
    const n = await renderNative(<BlockerSheet open onSubmit={onSubmit} onClose={() => {}} />);
    await n.flush();
    const notice = n.byTestId("blocker-covered-notice");
    expect(text(notice)).toBe("availability.covered.notice");
    // Above the save button, and nothing was sent to show it.
    const json = JSON.stringify(n.root.toJSON());
    expect(json.indexOf("blocker-covered-notice")).toBeLessThan(json.indexOf('"blocker-save"'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
