# Sibling Pressables, never nested

Across this scope, a `Pressable` that toggles/expands something is deliberately kept as a SIBLING of any other interactive elements in the same row, never a parent wrapping them. Nesting a Pressable inside another Pressable collapses the whole subtree into one accessible element on iOS, which hides the inner buttons from both VoiceOver and Maestro (the project's mobile E2E driver) even though they remain visually present and tappable-looking.

This was found empirically via Maestro on `exercise-group-folder.tsx` (an edit icon was visually present but unreachable by `accessibilityLabel` while nested inside the group-toggle Pressable) and is re-documented as a load-bearing constraint in `ValidateClassesSheet.tsx`'s `ClassCard` (the Validate button sits outside the header-toggle Pressable) and `PresenceMarkToggle.tsx` (three sibling option Pressables instead of one segmented-control widget).

**Implementing files:**

- frontend/apps/mobile/src/features/training/exercise-group-folder.tsx
- frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
- frontend/apps/mobile/src/features/presences/PresenceMarkToggle.tsx
