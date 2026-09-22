Across the mobile presences/training features, a `Pressable` that toggles/expands something is deliberately kept as a SIBLING of any other interactive elements in the same row, never a parent wrapping them — nesting a Pressable inside another Pressable collapses the whole subtree into one accessible element on iOS, hiding the inner buttons from both VoiceOver and Maestro even though they remain visually present and tappable-looking. Found empirically via Maestro on `exercise-group-folder.tsx` (an edit icon was visually present but unreachable while nested inside the group-toggle Pressable), and re-documented as a load-bearing constraint in `ValidateClassesSheet.tsx`'s `ClassCard` (the Validate button sits outside the header-toggle Pressable) and `PresenceMarkToggle.tsx` (three sibling option Pressables instead of one segmented-control widget). `floating-portal-menu` documents the same root cause independently, in a different mobile scope.

## Implemented by
`frontend/apps/mobile/src/features/training/exercise-group-folder.tsx`
`frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx`
`frontend/apps/mobile/src/features/presences/PresenceMarkToggle.tsx`

## Related concepts
[[floating-portal-menu]]
