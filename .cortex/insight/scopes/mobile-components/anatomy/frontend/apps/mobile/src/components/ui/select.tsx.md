---
path: frontend/apps/mobile/src/components/ui/select.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 145
size_tokens: 967
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "84b72176ab527e2aa105b9fc08e6e31c7f0c4d89ba0ffaccd1f6698d0ea561c6"
---

## Purpose

Styled wrapper around `@rn-primitives/select`: `Select`/`SelectGroup`
re-export the primitive's root pieces; `SelectValue`, `SelectTrigger` (adds
a trailing chevron icon), `SelectContent` (portals into the root
`<PortalHost />`, animates with `FadeIn`/`FadeOut`, opacity gated on the
primitive's own `open` context state), `SelectLabel`, `SelectItem` (with a
checkmark `ItemIndicator`), and `SelectSeparator` add NativeWind styling.
The file's own comment notes the root layout already mounts a
`<PortalHost />`, so consumers need no extra portal setup.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/select`,
`@expo/vector-icons`, `@levelup/config`, `react-native-reanimated`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for dropdown/picker fields throughout forms
in the app, outside this scope.
