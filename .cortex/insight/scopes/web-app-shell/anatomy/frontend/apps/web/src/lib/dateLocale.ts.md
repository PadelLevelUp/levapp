---
path: frontend/apps/web/src/lib/dateLocale.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 3
size_lines: 30
size_tokens: 305
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "72586fdefed8f3f85cc904ae327b8b3ca2993859717e7841136b8939834da9b2"
---

## Purpose

PAD-52: maps the active i18next UI language to the matching `date-fns` `Locale` object, so `format(date, fmt, { locale: dateFnsLocale(i18n.language) })` calls follow the coach's selected language instead of hardcoding English. Fixes a real bug where calendar components hardcoded `enUS`/`enGB`, so weekday/month names rendered in English regardless of the app's language setting.

## Main players

- `LOCALE_MAP` (lines 16–19) — `Record<string, Locale>` with two entries: `pt` and `en: enUS`. The only two supported date-fns locales, matching `i18n.ts`'s `SUPPORTED_LANGUAGES`.
- `dateFnsLocale(language?)` (lines 26–29, critical) — the sole export. Takes an optional language code (accepts region-tagged codes like `en-GB`, using only the primary subtag via `.split("-")[0]`), falls back through `language ?? i18n.language ?? "pt"`, and returns `LOCALE_MAP[lng] ?? pt` — so an unrecognized or missing language always resolves to Portuguese, never throws or returns undefined.

## Insights

- Double fallback to `pt`: once via the `language ?? i18n.language ?? "pt"` chain, and again via `LOCALE_MAP[lng] ?? pt` if the resolved code still isn't in the map (e.g. a hypothetical future `fr`). This matches the app-wide fallback locale locked in PAD-39 — pt is the fallback everywhere, not just here.
- The doc comment explicitly instructs callers to pass `i18n.language` from `useTranslation()` rather than relying on the internal `i18n.language` fallback, specifically so the calling component re-renders when the language changes (the internal fallback reads `i18n` directly, which isn't reactive on its own).
- `LOCALE_MAP` only has two entries — adding a third supported UI language requires updating this map in lockstep with `i18n.ts`'s `SUPPORTED_LANGUAGES`, or that new language silently gets Portuguese date formatting.

## Connections

Uses: `@/i18n` (default `i18n` instance, this scope, for the fallback language read), `date-fns` (external, `Locale` type), `date-fns/locale` (external, `enUS`/`pt` locale objects).

Used by: `frontend/apps/web/src/lib/conversationTime.ts` (`formatConversationTimestamp`'s weekday/date formatting).

## Query pointers

If you're adding a new supported UI language, update this file's `LOCALE_MAP` together with `i18n.ts`'s `SUPPORTED_LANGUAGES` — both must change or date formatting silently falls back to Portuguese for the new language. If date/weekday text is showing in the wrong language somewhere, check whether that call site passes `i18n.language` (via `useTranslation()`) into `dateFnsLocale` rather than omitting the argument.
