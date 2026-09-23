/**
 * B-157 / settings.unsaved-edits (PAD-394), iOS.
 *
 * Two things under test:
 *  1. The registry itself (`UnsavedRegistryProvider` / `useUnsavedReporter` /
 *     `useUnsavedRegistry`) — no mocking, these are plain React state.
 *  2. The back-row guard's DECISION shape: unsaved → confirm shown and the section
 *     stays; keep → stays; discard → list; clean → immediate leave. This is proven
 *     through a small `Harness` component built the same way
 *     `competency-manager.test.tsx` (PAD-399) built its screen-mirroring harness — it
 *     wires the REAL registry to a REAL back Pressable (testID `settings-back`) and a
 *     REAL confirm dialog, exactly as `app/settings.tsx` does, WITHOUT that screen's
 *     unrelated chrome (nav list, `useAuth`, `expo-router`, the 12 other sections) —
 *     mounting the actual default-exported screen would mean mocking all of that for
 *     no gain to this test. `@/components/ui/alert-dialog` is replaced the same way
 *     that file replaces it: the real `@rn-primitives/alert-dialog` renders its
 *     Content through a Portal invisible without a mounted `<PortalHost/>`.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { renderNative } from "@/test/render-native";
import {
  UnsavedRegistryProvider,
  useUnsavedReporter,
  useUnsavedRegistry,
} from "./unsaved-registry";

vi.mock("@/components/ui/alert-dialog", async () => {
  const { View, Text, Pressable } = await import("react-native");
  return {
    AlertDialog: (p: { open: boolean; children?: ReactNode }) =>
      p.open ? createElement(View, null, p.children) : null,
    AlertDialogContent: (p: { testID?: string; children?: ReactNode }) =>
      createElement(View, { testID: p.testID }, p.children),
    AlertDialogHeader: (p: { children?: ReactNode }) => createElement(View, null, p.children),
    AlertDialogTitle: (p: { children?: ReactNode }) => createElement(Text, null, p.children),
    AlertDialogDescription: (p: { children?: ReactNode }) => createElement(Text, null, p.children),
    AlertDialogFooter: (p: { children?: ReactNode }) => createElement(View, null, p.children),
    AlertDialogCancel: (p: { testID?: string; onPress?: () => void; children?: ReactNode }) =>
      createElement(Pressable, { testID: p.testID, onPress: p.onPress ?? (() => {}) }, p.children),
    AlertDialogAction: (p: { testID?: string; onPress?: () => void; children?: ReactNode }) =>
      createElement(Pressable, { testID: p.testID, onPress: p.onPress ?? (() => {}) }, p.children),
  };
});

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── 1. The registry, no UI ─────────────────────────────────────────────────

function Reporter({ id, unsaved }: { id: string; unsaved: boolean }) {
  useUnsavedReporter(id, unsaved);
  return null;
}

describe("UnsavedRegistryProvider / useUnsavedReporter (PAD-394)", () => {
  it("hasUnsaved reflects setUnsaved(true) and clears on setUnsaved(false)", async () => {
    let captured: ReturnType<typeof useUnsavedRegistry> | null = null;
    function Capture() {
      captured = useUnsavedRegistry();
      return null;
    }
    await renderNative(
      createElement(UnsavedRegistryProvider, null, createElement(Capture))
    );
    expect(captured!.hasUnsaved()).toBe(false);
    captured!.setUnsaved("a", true);
    expect(captured!.hasUnsaved()).toBe(true);
    captured!.setUnsaved("a", false);
    expect(captured!.hasUnsaved()).toBe(false);
  });

  it("aggregates across keys — any one unsaved keeps hasUnsaved() true", async () => {
    let captured: ReturnType<typeof useUnsavedRegistry> | null = null;
    function Capture() {
      captured = useUnsavedRegistry();
      return null;
    }
    await renderNative(
      createElement(UnsavedRegistryProvider, null, createElement(Capture))
    );
    captured!.setUnsaved("seasons", true);
    captured!.setUnsaved("workingHours", false);
    expect(captured!.hasUnsaved()).toBe(true); // one of two is unsaved
    captured!.setUnsaved("seasons", false);
    expect(captured!.hasUnsaved()).toBe(false); // both clean
  });

  it("useUnsavedReporter registers on report and clears its own entry on unmount", async () => {
    let captured: ReturnType<typeof useUnsavedRegistry> | null = null;
    function Capture() {
      captured = useUnsavedRegistry();
      return null;
    }
    function Scene({ mounted }: { mounted: boolean }) {
      return createElement(
        UnsavedRegistryProvider,
        null,
        createElement(Capture),
        mounted ? createElement(Reporter, { id: "profile", unsaved: true }) : null
      );
    }
    const n = await renderNative(createElement(Scene, { mounted: true }));
    await n.flush();
    expect(captured!.hasUnsaved()).toBe(true);

    // Unmounting the reporter (as leaving a section does) clears ITS entry —
    // never leaving a stale flag for a section that no longer exists.
    await n.rerender(createElement(Scene, { mounted: false }));
    await n.flush();
    expect(captured!.hasUnsaved()).toBe(false);
  });

  it("a revert back to the reported baseline (unsaved=false) also clears the entry", async () => {
    let captured: ReturnType<typeof useUnsavedRegistry> | null = null;
    function Capture() {
      captured = useUnsavedRegistry();
      return null;
    }
    function Scene({ unsaved }: { unsaved: boolean }) {
      return createElement(
        UnsavedRegistryProvider,
        null,
        createElement(Capture),
        createElement(Reporter, { id: "profile", unsaved })
      );
    }
    const n = await renderNative(createElement(Scene, { unsaved: true }));
    await n.flush();
    expect(captured!.hasUnsaved()).toBe(true);

    await n.rerender(createElement(Scene, { unsaved: false }));
    await n.flush();
    expect(captured!.hasUnsaved()).toBe(false);
  });

  it("useUnsavedReporter is a no-op with no Provider above it (a section mounted standalone in its own test)", async () => {
    // Must not throw — every existing *-section.test.tsx mounts its section with no
    // UnsavedRegistryProvider around it.
    await expect(renderNative(createElement(Reporter, { id: "profile", unsaved: true }))).resolves.toBeTruthy();
  });

  it("useUnsavedRegistry throws with no Provider above it", async () => {
    function Bare() {
      useUnsavedRegistry();
      return null;
    }
    await expect(renderNative(createElement(Bare))).rejects.toThrow(/UnsavedRegistryProvider/);
  });
});

// ── 2. The back-row guard's decision shape (mirrors app/settings.tsx) ──────

/**
 * Mirrors the relevant slice of `SettingsScreenBody` in app/settings.tsx: a back
 * Pressable (testID `settings-back`) that either leaves at once or opens the confirm
 * dialog, and the dialog itself (`settings-unsaved-dialog` / `-keep` / `-discard`).
 * `onLeave` stands in for `setOpenId(null)`; `section-unsaved-toggle` stands in for a
 * real section's own edit (a real section calls `useUnsavedReporter` from deep inside
 * its own form — this harness exposes the same call through a button so the test can
 * drive it directly).
 */
function BackRowHarness({ onLeave }: { onLeave: () => void }) {
  const registry = useUnsavedRegistry();
  const [sectionUnsaved, setSectionUnsaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useUnsavedReporter("profile", sectionUnsaved);

  return createElement(
    View,
    null,
    createElement(Pressable, {
      testID: "section-unsaved-toggle",
      onPress: () => setSectionUnsaved((v) => !v),
    }),
    createElement(Pressable, {
      testID: "settings-back",
      onPress: () => {
        if (registry.hasUnsaved()) setConfirmOpen(true);
        else onLeave();
      },
    }),
    createElement(
      AlertDialog,
      { open: confirmOpen, onOpenChange: setConfirmOpen },
      createElement(
        AlertDialogContent,
        { testID: "settings-unsaved-dialog" },
        createElement(AlertDialogHeader, null, createElement(AlertDialogTitle, null, "Discard changes?")),
        createElement(
          AlertDialogFooter,
          null,
          createElement(AlertDialogCancel, {
            testID: "settings-unsaved-keep",
            onPress: () => setConfirmOpen(false),
          }),
          createElement(AlertDialogAction, {
            testID: "settings-unsaved-discard",
            onPress: () => {
              setConfirmOpen(false);
              onLeave();
            },
          })
        )
      )
    )
  );
}

function renderBackRowHarness(onLeave: () => void) {
  return renderNative(
    createElement(UnsavedRegistryProvider, null, createElement(BackRowHarness, { onLeave }))
  );
}

describe("Settings back-row guard (settings.unsaved-edits rules 3–4)", () => {
  it("nothing unsaved: leaves at once, no confirm", async () => {
    const onLeave = vi.fn();
    const n = await renderBackRowHarness(onLeave);
    await n.flush();

    await n.press("settings-back");

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(n.queryByTestId("settings-unsaved-dialog")).toBeNull();
  });

  it("unsaved: pressing back opens the confirm and the section stays (onLeave not called)", async () => {
    const onLeave = vi.fn();
    const n = await renderBackRowHarness(onLeave);
    await n.flush();
    await n.press("section-unsaved-toggle");

    await n.press("settings-back");

    expect(onLeave).not.toHaveBeenCalled();
    expect(n.queryByTestId("settings-unsaved-dialog")).not.toBeNull();
  });

  it("keep editing: the dialog closes, the section stays, onLeave not called", async () => {
    const onLeave = vi.fn();
    const n = await renderBackRowHarness(onLeave);
    await n.flush();
    await n.press("section-unsaved-toggle");
    await n.press("settings-back");
    expect(n.queryByTestId("settings-unsaved-dialog")).not.toBeNull();

    await n.press("settings-unsaved-keep");

    expect(onLeave).not.toHaveBeenCalled();
    expect(n.queryByTestId("settings-unsaved-dialog")).toBeNull();
  });

  it("discard: the dialog closes and onLeave fires (the list is shown)", async () => {
    const onLeave = vi.fn();
    const n = await renderBackRowHarness(onLeave);
    await n.flush();
    await n.press("section-unsaved-toggle");
    await n.press("settings-back");

    await n.press("settings-unsaved-discard");

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(n.queryByTestId("settings-unsaved-dialog")).toBeNull();
  });
});
