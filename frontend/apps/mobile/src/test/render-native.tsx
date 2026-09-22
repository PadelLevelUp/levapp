/**
 * PAD-393 (B-156): mount a mobile component in a unit test.
 *
 * `react-native` is aliased to `src/test/mocks/react-native.ts`, whose host primitives
 * render plain elements, so `react-test-renderer` (already a dependency; the setup file
 * opts into its `act`) can mount a section the way the web tests mount theirs in jsdom.
 * Anything native beyond that — icons, nativewind, `@rn-primitives/*` — is mocked in the
 * test with `vi.mock`, exactly as the web tests mock Radix.
 *
 * Deliberately small: `byTestId`, `press`, `toggle`, `changeText` and `rerender` are what a
 * behavioural test of a section needs. Grow it only when a test needs more. A control with no
 * handler THROWS rather than passing the press — a dead control must fail loudly.
 */
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { ReactElement } from "react";

export type Native = {
  root: ReactTestRenderer;
  byTestId: (id: string) => ReactTestInstance;
  queryByTestId: (id: string) => ReactTestInstance | null;
  /** Calls the element's `onPress`; throws if it has none (a dead control is a test error, not a pass). */
  press: (id: string) => Promise<void>;
  /**
   * Presses a `role="switch"` element — the accessibility contract a real
   * `@rn-primitives/switch` Root exposes (a Pressable whose onPress calls
   * `onCheckedChange(!checked)`), and what Maestro taps. Throws if the element is not a
   * switch or has no onPress.
   */
  toggle: (id: string) => Promise<void>;
  changeText: (id: string, text: string) => Promise<void>;
  rerender: (el: ReactElement) => Promise<void>;
  /** Let pending promises (a mocked API call) resolve and their state land. */
  flush: () => Promise<void>;
};

export async function renderNative(el: ReactElement): Promise<Native> {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(el);
  });
  const find = (id: string) =>
    root.root.findAll((n) => n.props?.testID === id && typeof n.type === "string");
  const byTestId = (id: string) => {
    const hits = find(id);
    if (hits.length === 0) throw new Error(`no element with testID "${id}"`);
    return hits[0];
  };
  // One macrotask drains the whole microtask queue — two awaits and a finally included —
  // where two bare ticks would leave the tail of a chain pending (#375 review).
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const handler = (id: string, name: string) => {
    const n = byTestId(id);
    const fn = n.props[name];
    if (typeof fn !== "function") throw new Error(`no ${name} handler on "${id}"`);
    return { n, fn };
  };
  return {
    root,
    byTestId,
    queryByTestId: (id) => find(id)[0] ?? null,
    press: async (id) => { const { fn } = handler(id, "onPress"); await act(async () => { fn(); }); },
    toggle: async (id) => {
      const n = byTestId(id);
      if (n.props.role !== "switch" && n.props.accessibilityRole !== "switch") throw new Error(`"${id}" is not a role="switch" element`);
      const { fn } = handler(id, "onPress");
      await act(async () => { fn(); });
    },
    changeText: async (id, text) => { const n = byTestId(id); await act(async () => { n.props.onChangeText?.(text); }); },
    rerender: async (next) => { await act(async () => { root.update(next); }); },
    flush,
  };
}
