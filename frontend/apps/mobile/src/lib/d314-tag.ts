// PROBE ONLY (B-089 face C): log a host view's native tag once it is attached.
export function d314Tag(name: string) {
  return (r: unknown) => {
    if (!r) return;
    const o = r as { __nativeTag?: number; _nativeTag?: number; nativeTag?: number };
    console.log(`D314 tag ${name}=${o.__nativeTag ?? o._nativeTag ?? o.nativeTag ?? "?"}`);
  };
}
