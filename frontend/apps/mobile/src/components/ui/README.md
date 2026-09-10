# Mobile UI Kit

react-native-reusables-style components (NativeWind v4 + @rn-primitives + cva). All accept `className`, pass through `testID`/accessibility props, and style Text explicitly via `TextClassContext` (no inheritance). Brand tokens come from `tailwind.config.js` (`@levelup/config`).

- `text.tsx` — `Text`, `TextClassContext`. Base themed Text; always use instead of RN Text.
- `button.tsx` — `Button` (+ `buttonVariants`, `buttonTextVariants`). Variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon. Children Text is styled via context.
- `input.tsx` — `Input`. Themed single-line TextInput.
- `textarea.tsx` — `Textarea`. Multiline TextInput (default 4 lines, top-aligned).
- `label.tsx` — `Label` (@rn-primitives/label).
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `avatar.tsx` — `Avatar`, `AvatarImage`, `AvatarFallback` (`alt` required on Avatar).
- `badge.tsx` — `Badge`. Variants: default/secondary/destructive/success/warning/outline. Put a `<Text>` child inside.
- `select.tsx` — `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, type `Option`. Value is `{ value, label }`. Renders via the root `<PortalHost />` (already mounted in `app/_layout.tsx`).
- `dialog.tsx` — `Dialog`, `DialogTrigger`, `DialogContent` (has X close), `DialogHeader/Footer/Title/Description`, `DialogClose`. Portal-based.
- `alert-dialog.tsx` — `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader/Footer/Title/Description`, `AlertDialogAction` (primary), `AlertDialogCancel` (outline). Put `<Text>` inside Action/Cancel.
- `switch.tsx` — `Switch`. Controlled: `checked` + `onCheckedChange`.
- `checkbox.tsx` — `Checkbox`. Controlled: `checked` + `onCheckedChange`.
- `tabs.tsx` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Controlled: `value` + `onValueChange`.
- `separator.tsx` — `Separator`. `orientation` horizontal (default) or vertical.
- `skeleton.tsx` — `Skeleton`. Pulsing placeholder; size with className (e.g. `h-4 w-32`).
- `spinner.tsx` — `Spinner`. ActivityIndicator, brand primary color by default.

Shared (one level up, `src/components/`):

- `screen.tsx` — `Screen`. SafeAreaView page wrapper with optional `title` header + `testID`. Omit `title` inside tab screens (navigator renders the header).
- `empty-state.tsx` — `EmptyState` (icon + title + message, testID `empty-state`).
- `error-state.tsx` — `ErrorState` (icon + message + optional `onRetry` button, testID `error-state`, retry button testID `error-state-retry`).

Also available: `src/lib/sse.ts` (`useAppEvents(onEvent)` — the app's one shared event stream, PAD-277), `src/lib/push` (`getPushRegistrar()`), `date-fns@^3.6.0`, `@react-native-community/datetimepicker`.
