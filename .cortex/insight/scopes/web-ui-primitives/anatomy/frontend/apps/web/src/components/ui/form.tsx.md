---
path: frontend/apps/web/src/components/ui/form.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 130
size_tokens: 1003
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7f6f3b157f0c08880937ae41d5e61647703c7163c3d8444656de711fb0576faf"
---

## Purpose

react-hook-form integration layer (`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormDescription`/`FormMessage`). Two nested React contexts (`FormFieldContext` for the field name, `FormItemContext` for a generated id) let `useFormField()` derive `formItemId`/`formDescriptionId`/`formMessageId` and wire them into `aria-describedby`/`aria-invalid` on `FormControl`, and error state into `FormLabel`/`FormMessage` styling.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/label`: `Label`, wrapped by `FormLabel` to add error-state styling.
- `@radix-ui/react-label`: `Root` type, for `FormLabel`'s prop typing.
- `@radix-ui/react-slot`: `Slot`, backing `FormControl` so it can pass its aria attributes to an arbitrary child input.
- `react`: context, `useId`, `forwardRef`.
- `react-hook-form`: `Controller`, `FormProvider`, `useFormContext` — the underlying form-state library `Form`/`FormField` wrap.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
