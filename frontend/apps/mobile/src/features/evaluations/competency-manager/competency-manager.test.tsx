/**
 * PAD-399 (B-158) — the competency manager's twin of PAD-393/B-156: an UNSAVED edit
 * must survive (a) `t` getting a new identity (a language settling) and (b) a refetch
 * of the competency list, the exact defect family PAD-392/B-155 named ("an effect keyed
 * on `t` reloads and silently undoes an edit"). Two spots in this screen hold unsaved
 * text across renders — the add-custom-competency name and the delete-dialog's typed
 * confirmation — and both are proven here.
 *
 * Mount: the leaf components the ticket names (`AddCustomCompetency`,
 * `DeleteCompetencyDialog`) plus the real `CompetencyRow` and the real
 * `useEvaluationCompetencies` hook, wired together by a small harness defined in this
 * file that mirrors what `CompetencyManagerScreen` does in its body — a list of rows, the
 * add form, the delete dialog — WITHOUT the screen's chrome (`Screen`, `ErrorState`,
 * `Skeleton`, `KeyboardAvoidingView`, `expo-router`, `useAuth`'s coach gate). That chrome
 * is irrelevant to the defect under test, and `Screen` drags in the real
 * `react-native-safe-area-context` package, which reaches a codegen'd native component at
 * import time the `react-native` stub does not provide — so mounting the actual default
 * screen is impractical here, per the ticket's own escape hatch. Reusing the real
 * `CompetencyRow` (rather than a stand-in) means "a row testID present" and "the list
 * read mock was called exactly twice" are proven against the production list-rendering
 * path, and its own `competency-delete-<rowId>` button is what opens the dialog in test 4
 * — exactly the control a coach presses.
 *
 * vi.mock inventory:
 *  - "@levelup/hooks" — NOT `@levelup/api` (see below for why). Every `use*` export
 *    these three files import is replaced by a small homemade query/mutation shim built
 *    on plain `useState`/`useEffect`, backed by the `api` spies below; `evaluationApiErrorCode`
 *    is reimplemented verbatim (it is pure — no react-query, three lines) so
 *    `add-custom-competency.tsx`'s import still resolves. Why not mock `@levelup/api` and
 *    let the REAL hooks run, the way the template and the web `CompetencyManager.test.tsx`
 *    do: this workspace has two React copies — root `node_modules/react` is 18.3.1, this
 *    app's own is 19.1.0 — and `@tanstack/react-query` is hoisted to the root, so its
 *    `useQuery`/`useMutation` call the ROOT React's `useEffect` while `react-test-renderer`
 *    (mounted from `renderNative`) is the mobile app's own React 19 copy; two React
 *    instances in one render tree is exactly "Invalid hook call" (confirmed empirically —
 *    `Cannot read properties of null (reading 'useEffect')` from inside
 *    `QueryClientProvider`). Fixing that is a workspace dependency change, out of scope
 *    for a single test file; mocking the hooks module is the ticket's own named fallback.
 *    The shim keeps `useEvaluationCompetencies`' refetch semantics observable: its
 *    `refetch` is captured, at render time, into the file-scoped `listRefetch` below, so
 *    test 2 can force a second read the way a real `invalidateQueries()` would, without
 *    `@tanstack/react-query` in the tree at all.
 *  - "react-i18next" — `useTranslation` returns a reassignable `currentT`, whose
 *    identity `settleLanguage()` changes; the harness template's mechanism for the bug.
 *  - "@expo/vector-icons" — `CompetencyRow`'s rename/delete icons; no icon rendering
 *    machinery exists under vitest's node environment.
 *  - "@/components/ui/alert-dialog" — replaced with host RN primitives. The real
 *    `@rn-primitives/alert-dialog` renders its content through `@rn-primitives/portal`'s
 *    zustand-backed `Portal`, which only becomes visible in the tree under a mounted
 *    `<PortalHost/>` — absent here — so `competency-delete-dialog` would never appear
 *    in `root.root.findAll`. The stand-in renders inline instead, gated on `open`.
 *  - "@/components/ui/switch" is NOT mocked: `src/test/render-native.test.tsx` already
 *    proves the real one (through `@rn-primitives/switch`) mounts and responds to
 *    `toggle()` under this harness, and no test here needs to flip it.
 *
 * Every assertion is on testIDs, props (`.props.value`) or mock call counts. `t` returns
 * the key throughout, so no assertion can accidentally be reading rendered copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import type { ReactNode } from "react";
import type {
  EvaluationCategoryImpact,
  EvaluationCompetencies,
  EvaluationCompetency,
  EvaluationCompetencyPatch,
} from "@levelup/types";
import { categorySections, managerSections } from "@levelup/config";
import { managerRowId } from "./competency-row";
import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({
  getEvaluationCompetencies: vi.fn(),
  switchOnCatalogueCompetency: vi.fn(),
  createCustomCompetency: vi.fn(),
  updateEvaluationCompetency: vi.fn(),
  deleteEvaluationCompetency: vi.fn(),
  getEvaluationCompetencyImpact: vi.fn(),
}));

// Exposed by the "@levelup/hooks" mock below; captures the list query's own `refetch`
// so the test can force a second read (test 2) without a real QueryClient.
let listRefetch: (() => void) | null = null;

vi.mock("@levelup/hooks", async () => {
  const React = await import("react");

  function useFakeQuery<T>(fetcher: () => Promise<T>, key: unknown, enabled: boolean) {
    const [state, setState] = React.useState<{ data?: T; isError: boolean }>({ isError: false });
    const [tick, setTick] = React.useState(0);
    const refetch = React.useCallback(() => setTick((t) => t + 1), []);
    React.useEffect(() => {
      if (!enabled) return;
      let alive = true;
      fetcher().then(
        (data) => { if (alive) setState({ data, isError: false }); },
        () => { if (alive) setState((s) => ({ ...s, isError: true })); },
      );
      return () => { alive = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, tick, key]);
    return { data: state.data, isError: state.isError, refetch };
  }

  function useFakeMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    const [isPending, setIsPending] = React.useState(false);
    return {
      isPending,
      mutateAsync: async (args: TArgs) => {
        setIsPending(true);
        try {
          return await fn(args);
        } finally {
          setIsPending(false);
        }
      },
    };
  }

  return {
    useEvaluationCompetencies: (enabled = true) => {
      const q = useFakeQuery(api.getEvaluationCompetencies, null, enabled);
      listRefetch = q.refetch; // captured at render time — a test-only escape hatch
      return q;
    },
    useCreateCustomCompetency: () =>
      useFakeMutation((input: string | { name: string; parentId: number }) =>
        typeof input === "string" ? api.createCustomCompetency(input) : api.createCustomCompetency(input.name, input.parentId)),
    useUpdateEvaluationCompetency: () =>
      useFakeMutation((args: { id: number; patch: EvaluationCompetencyPatch }) =>
        api.updateEvaluationCompetency(args.id, args.patch)),
    useSwitchOnCatalogueCompetency: () => useFakeMutation((key: string) => api.switchOnCatalogueCompetency(key)),
    useDeleteEvaluationCompetency: () => useFakeMutation((id: number) => api.deleteEvaluationCompetency(id)),
    useEvaluationCompetencyImpact: (competencyId: number | null, enabled = true) =>
      useFakeQuery<EvaluationCategoryImpact>(
        () => api.getEvaluationCompetencyImpact(competencyId as number),
        competencyId,
        competencyId !== null && enabled,
      ),
    // Pure — verbatim copy of packages/hooks/src/evaluations.ts's implementation.
    evaluationApiErrorCode: (error: unknown): string | null => {
      const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
      const code = (data as { error?: unknown } | null)?.error;
      return typeof data === "object" && typeof code === "string" ? code : null;
    },
  };
});

let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

// The real @rn-primitives/alert-dialog renders its Content through a Portal that is
// invisible without a mounted <PortalHost/> (see header comment) — replaced inline.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { View, Text, Pressable } = await import("react-native");
  return {
    AlertDialog: (p: { open: boolean; children?: ReactNode }) => (p.open ? createElement(View, null, p.children) : null),
    AlertDialogContent: (p: { testID?: string; children?: ReactNode }) => createElement(View, { testID: p.testID }, p.children),
    AlertDialogHeader: (p: { children?: ReactNode }) => createElement(View, null, p.children),
    AlertDialogTitle: (p: { children?: ReactNode }) => createElement(Text, null, p.children),
    AlertDialogDescription: (p: { testID?: string; children?: ReactNode }) => createElement(Text, { testID: p.testID }, p.children),
    AlertDialogFooter: (p: { children?: ReactNode }) => createElement(View, null, p.children),
    AlertDialogCancel: (p: { testID?: string; disabled?: boolean; onPress?: () => void; children?: ReactNode }) =>
      createElement(Pressable, { testID: p.testID, disabled: p.disabled, onPress: p.onPress ?? (() => {}) }, p.children),
    AlertDialogAction: (p: { testID?: string; disabled?: boolean; onPress?: () => void; children?: ReactNode }) =>
      createElement(Pressable, { testID: p.testID, disabled: p.disabled, onPress: p.onPress ?? (() => {}) }, p.children),
  };
});

import { AddCustomCompetency } from "./add-custom-competency";
import { CompetencyRow } from "./competency-row";
import { DeleteCompetencyDialog } from "./delete-competency-dialog";
import { CategorySectionView } from "./category-section";
import { useEvaluationCompetencies } from "@levelup/hooks";
import { View } from "react-native";

function competency(over: Partial<EvaluationCompetency>): EvaluationCompetency {
  return { id: 1, key: null, name: "x", group: null, scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over };
}

// A legacy row (key: null, group: null) is "editable" — CompetencyRow renders its own
// `competency-delete-<rowId>` button for it, which test 4 presses to open the dialog.
const FOREHAND = competency({ id: 7, name: "Forehand", group: null, scaleMin: 1, scaleMax: 10 });
const DATA_V1: EvaluationCompetencies = { competencies: [FOREHAND], catalogue: [] };

const BACKHAND = competency({ id: 9, name: "Backhand", group: null, scaleMin: 1, scaleMax: 10 });
const DATA_V2: EvaluationCompetencies = { competencies: [FOREHAND, BACKHAND], catalogue: [] };

/**
 * Mirrors what `CompetencyManagerScreen` does in its render body — the list, the add
 * form, the delete dialog — without the screen's navigation/auth/loading chrome, which
 * this test has no stake in.
 */
function Harness() {
  const competencies = useEvaluationCompetencies(true);
  const [deleting, setDeleting] = useState<EvaluationCompetency | null>(null);
  const rows = competencies.data ? managerSections(competencies.data).flatMap((s) => s.rows) : [];
  // The row list is passed as ONE array child (not spread into individual args): spreading
  // would fold each row into `View`'s flat children list, so `AddCustomCompetency`'s
  // implicit position-key shifts whenever the row count changes (1 row -> 2 rows moves it
  // from index 1 to index 2), and React remounts it — losing exactly the state this test
  // proves survives. The real screen avoids this for free: `{sections.map(...)}` is JSX's
  // own single array-child slot, with `<AddCustomCompetency />` a fixed sibling after it.
  return createElement(
    View,
    null,
    rows.map((row) => createElement(CompetencyRow, { key: managerRowId(row), row, onDelete: setDeleting })),
    createElement(AddCustomCompetency),
    createElement(DeleteCompetencyDialog, { competency: deleting, onClose: () => setDeleting(null) }),
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getEvaluationCompetencies.mockResolvedValue(DATA_V1);
  api.getEvaluationCompetencyImpact.mockResolvedValue({ scores: 0, players: 0 });
  settleLanguage();
  listRefetch = null;
});

describe("competency manager (iOS) — an unsaved edit never gets undone (PAD-392/B-155 family)", () => {
  it("keeps a typed custom-competency name when the language settles afterwards", async () => {
    const n = await renderNative(createElement(Harness));
    await n.flush();
    expect(n.queryByTestId("competency-row-id-7")).not.toBeNull();

    await n.changeText("competency-add-name", "Maestro Cat");
    expect(n.byTestId("competency-add-name").props.value).toBe("Maestro Cat");

    settleLanguage();
    // A FRESH element, not the one already mounted: reusing the same element/props object
    // lets React's `oldProps === newProps` bailout skip re-rendering the subtree entirely
    // (found empirically while proving the mutant kills this test — the "rerender" was a
    // silent no-op), exactly as the template's `rerender(<WorkingHoursSection />)` already
    // constructs fresh JSX each call.
    await n.rerender(createElement(Harness));
    await n.flush();

    expect(n.byTestId("competency-add-name").props.value).toBe("Maestro Cat");
    expect(api.createCustomCompetency).not.toHaveBeenCalled();
  });

  it("keeps a typed name when the list is refetched", async () => {
    const el = createElement(Harness);
    const n = await renderNative(el);
    await n.flush();
    expect(n.queryByTestId("competency-row-id-7")).not.toBeNull();
    expect(n.queryByTestId("competency-row-id-9")).toBeNull();

    await n.changeText("competency-add-name", "Maestro Cat");

    api.getEvaluationCompetencies.mockResolvedValue(DATA_V2);
    await act(async () => {
      listRefetch?.();
    });
    await n.flush();

    expect(n.byTestId("competency-add-name").props.value).toBe("Maestro Cat");
    expect(n.queryByTestId("competency-row-id-9")).not.toBeNull();
    expect(api.getEvaluationCompetencies).toHaveBeenCalledTimes(2);
  });

  it("a successful add DOES clear the field — by design (Session-C)", async () => {
    api.createCustomCompetency.mockResolvedValue(competency({ id: 20, name: "Maestro Cat", group: "custom" }));
    const el = createElement(Harness);
    const n = await renderNative(el);
    await n.flush();

    await n.changeText("competency-add-name", "Maestro Cat");
    await n.press("competency-add-submit");
    await n.flush();

    expect(n.byTestId("competency-add-name").props.value).toBe("");
    expect(api.createCustomCompetency).toHaveBeenCalledTimes(1);
    expect(api.createCustomCompetency).toHaveBeenCalledWith("Maestro Cat");
  });

  it("keeps a partly typed delete-confirmation name across a new t", async () => {
    const n = await renderNative(createElement(Harness));
    await n.flush();

    await n.press("competency-delete-id-7");
    await n.flush();
    expect(n.queryByTestId("competency-delete-dialog")).not.toBeNull();

    await n.changeText("competency-delete-name", "Mae");
    expect(n.byTestId("competency-delete-name").props.value).toBe("Mae");

    settleLanguage();
    // Fresh element per rerender — see the header comment above test 1.
    await n.rerender(createElement(Harness));
    await n.flush();

    expect(n.byTestId("competency-delete-name").props.value).toBe("Mae");
    expect(api.deleteEvaluationCompetency).not.toHaveBeenCalled();
  });
});

// PAD-431 (evaluations.competencies rules 8, 9, 15): "Definir categorias de avaliação" on iOS,
// the same sections and test ids as web.
describe("categories and sub-categories on iOS (PAD-431)", () => {
  const TECHNIQUE = competency({ id: 1, key: "technique", name: "Técnica", group: "general", parentId: null });
  const BANDEJA = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique", parentId: 1 });
  const TREE: EvaluationCompetencies = {
    competencies: [TECHNIQUE, BANDEJA],
    catalogue: [{ key: "volley", group: "technique" }, { key: "tactics", group: "general" }, { key: "transition", group: "tactics" }],
  };

  function TreeHarness() {
    const competencies = useEvaluationCompetencies(true);
    const [deleting, setDeleting] = useState<EvaluationCompetency | null>(null);
    const sections = competencies.data ? categorySections(competencies.data) : [];
    const subNames = deleting
      ? (competencies.data?.competencies ?? []).filter((c) => c.parentId === deleting.id).map((c) => c.name)
      : [];
    return createElement(
      View,
      null,
      sections.map((section) => createElement(CategorySectionView, { key: section.id, section, onDelete: setDeleting })),
      createElement(DeleteCompetencyDialog, { competency: deleting, subNames, onClose: () => setDeleting(null) }),
    );
  }

  const inside = (n: Awaited<ReturnType<typeof renderNative>>, section: string, id: string) =>
    n.byTestId(section).findAll((node) => node.props.testID === id).length > 0;

  beforeEach(() => api.getEvaluationCompetencies.mockResolvedValue(TREE));

  it("each category heads its section, with its sub-categories and the defaults it lacks under it", async () => {
    const n = await renderNative(createElement(TreeHarness));
    await n.flush();

    expect(inside(n, "competency-section-key-technique", "competency-row-key-technique")).toBe(true);
    expect(inside(n, "competency-section-key-technique", "competency-row-key-bandeja")).toBe(true);
    expect(inside(n, "competency-section-key-technique", "competency-row-key-volley")).toBe(true);
    expect(inside(n, "competency-section-key-tactics", "competency-row-key-transition")).toBe(true);
  });

  it("a default can be renamed and deleted (rules 8, 9)", async () => {
    const n = await renderNative(createElement(TreeHarness));
    await n.flush();

    expect(n.queryByTestId("competency-rename-key-bandeja")).not.toBeNull();
    expect(n.queryByTestId("competency-delete-key-bandeja")).not.toBeNull();
  });

  it("adds a sub-category under a held category by parentId; an offered default has no field", async () => {
    api.createCustomCompetency.mockResolvedValue(competency({ id: 30, name: "Recuperação", group: "custom", parentId: 1 }));
    const n = await renderNative(createElement(TreeHarness));
    await n.flush();

    await n.changeText("competency-add-sub-key-technique-name", " Recuperação ");
    await n.press("competency-add-sub-key-technique-submit");
    await n.flush();

    expect(api.createCustomCompetency).toHaveBeenCalledWith("Recuperação", 1);
    expect(n.queryByTestId("competency-add-sub-key-tactics-name")).toBeNull();
  });

  it("deleting a category names the sub-categories that go with it", async () => {
    const n = await renderNative(createElement(TreeHarness));
    await n.flush();

    await n.press("competency-delete-key-technique");
    await n.flush();

    expect(n.queryByTestId("competency-delete-subs")).not.toBeNull();
  });
});
