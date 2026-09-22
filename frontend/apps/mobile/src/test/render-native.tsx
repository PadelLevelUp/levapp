/**
 * PAD-393 (B-156): mount a mobile component in a unit test.
 *
 * `react-native` is aliased to `src/test/mocks/react-native.ts`, whose host primitives
 * render plain elements, so `react-test-renderer` (already a dependency; the setup file
 * opts into its `act`) can mount a section the way the web tests mount theirs in jsdom.
 * Anything native beyond that — icons, nativewind, `@rn-primitives/*` — is mocked in the
 * test with `vi.mock`, exactly as the web tests mock Radix.
 *
 * Deliberately small: `byTestId`, `press`, `changeText` and `rerender` are what a
 * behavioural test of a section needs. Grow it only when a test needs more.
 */
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { ReactElement } from "react";

export type Native = {
  root: ReactTestRenderer;
  byTestId: (id: string) => ReactTestInstance;
  queryByTestId: (id: string) => ReactTestInstance | null;
  press: (id: string) => Promise<void>;
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
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return {
    root,
    byTestId,
    queryByTestId: (id) => find(id)[0] ?? null,
    press: async (id) => { const n = byTestId(id); await act(async () => { (n.props.onPress ?? n.props.onCheckedChange)?.(!n.props.checked); }); },
    changeText: async (id, text) => { const n = byTestId(id); await act(async () => { n.props.onChangeText?.(text); }); },
    rerender: async (next) => { await act(async () => { root.update(next); }); },
    flush,
  };
}
