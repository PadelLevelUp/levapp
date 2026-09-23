/**
 * PAD-394 (B-157), settings.unsaved-edits rule 2 on CoachLevelsSection.
 *
 * `levelsUnsaved` (pure, exported from coach-levels-section.tsx) covers rule 2's full
 * shape for this section: value equality, POSITIONAL (a reorder is a real edit — Save
 * derives `displayOrder` from list position), where add/remove fall out of the same
 * comparison because a new row's generated id never matches a saved id.
 *
 * The section's two text fields (code/label) carry no testID (only an
 * accessibilityLabel — an existing gap, not something this ticket's contract asks to
 * fix), so a full mount-driven edit/revert/save walk isn't practical here the way it is
 * for profile-section.tsx. One mount smoke test proves the WIRING instead, through the
 * one control that does have a stable testID (`settings-levels-add`): adding a row is
 * itself a real, observable edit (a new id never in `saved`), so it's enough to prove
 * `useUnsavedReporter("coachLevels", levelsUnsaved(...))` is actually called by the
 * mounted component, not just defined.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

let currentT = (key: string) => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: currentT }) }));

const addCoachLevel = vi.fn();
const deleteCoachLevel = vi.fn();
vi.mock("@levelup/api", () => ({
  coachLevelApi: {
    addCoachLevel: (...a: unknown[]) => addCoachLevel(...a),
    deleteCoachLevel: (...a: unknown[]) => deleteCoachLevel(...a),
  },
}));

const getCoachLevels = vi.fn();
vi.mock("@levelup/hooks", async () => {
  const React = await import("react");
  return {
    queryKeys: { coachLevels: ["coach-levels"] },
    useCoachLevels: () => {
      const [data, setData] = React.useState<unknown>(undefined);
      React.useEffect(() => {
        let alive = true;
        getCoachLevels().then((d: unknown) => {
          if (alive) setData(d);
        });
        return () => {
          alive = false;
        };
      }, []);
      return { data, isLoading: data === undefined };
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});

import { levelsUnsaved, CoachLevelsSection } from "./coach-levels-section";

const LOADED = [
  { id: "1", code: "B1", label: "Beginner", displayOrder: 1 },
  { id: "2", code: "I1", label: "Intermediate", displayOrder: 2 },
];

beforeEach(() => {
  getCoachLevels.mockReset().mockResolvedValue(LOADED);
  addCoachLevel.mockReset();
  deleteCoachLevel.mockReset();
});

describe("levelsUnsaved (settings.unsaved-edits rule 2)", () => {
  const SAVED = [
    { id: "1", code: "B1", label: "Beginner" },
    { id: "2", code: "I1", label: "Intermediate" },
  ];

  it("is false for the identical list, true for an edited field", () => {
    expect(levelsUnsaved(SAVED, SAVED)).toBe(false);
    expect(levelsUnsaved([{ ...SAVED[0], label: "Iniciante" }, SAVED[1]], SAVED)).toBe(true);
  });

  it("a reorder (same rows, different position) is unsaved — Save derives order from position", () => {
    const reordered = [SAVED[1], SAVED[0]];
    expect(levelsUnsaved(reordered, SAVED)).toBe(true);
  });

  it("an added row (a new, never-saved id) is unsaved", () => {
    const withAdd = [...SAVED, { id: "new-1", code: "", label: "" }];
    expect(levelsUnsaved(withAdd, SAVED)).toBe(true);
  });

  it("removing the just-added row returns to clean — a hand-revert, not 'was touched'", () => {
    const withAdd = [...SAVED, { id: "new-1", code: "", label: "" }];
    expect(levelsUnsaved(withAdd, SAVED)).toBe(true);
    expect(levelsUnsaved(withAdd.slice(0, 2), SAVED)).toBe(false);
  });

  it("removing an existing row IS unsaved against the old baseline, and clean once the baseline drops it too", () => {
    const withoutSecond = [SAVED[0]];
    expect(levelsUnsaved(withoutSecond, SAVED)).toBe(true);
    // handleRemove's success path updates `saved` to match — an already-persisted
    // deletion must not misreport as an unsaved edit.
    expect(levelsUnsaved(withoutSecond, withoutSecond)).toBe(false);
  });

  it("a successful save's new baseline (the drafts just sent) makes the same values clean", () => {
    const edited = [{ ...SAVED[0], label: "Iniciante" }, SAVED[1]];
    expect(levelsUnsaved(edited, edited)).toBe(false);
  });
});

describe("CoachLevelsSection registers its unsaved state (PAD-394)", () => {
  it("adding a row is reported as unsaved (proves the wiring, not just the pure function)", async () => {
    let registry!: ReturnType<typeof useUnsavedRegistry>;
    function Capture() {
      registry = useUnsavedRegistry();
      return null;
    }
    const n = await renderNative(
      createElement(
        UnsavedRegistryProvider,
        null,
        createElement(Capture),
        createElement(CoachLevelsSection)
      )
    );
    await n.flush();
    expect(registry.hasUnsaved()).toBe(false);

    await n.press("settings-levels-add");
    expect(registry.hasUnsaved()).toBe(true);
  });
});
