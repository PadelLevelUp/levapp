---
path: frontend/apps/web/src/lib/conversationTime.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 3
size_lines: 51
size_tokens: 467
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "76a1da79c3c9d5edf53418c177982dada657d094a4796c1693611104e8f0ba67"
---

## Purpose

PAD-98: formats a conversation's last-message timestamp for the chat list with a relative-day indicator (today → time only, yesterday → localized "Yesterday", within a week → weekday abbreviation, older → short localized date), replacing an earlier version that always showed only the time and made same-day/different-day conversations indistinguishable.

## Main players

- `FormatConversationTimestampOptions` (lines 4–11) — options interface: `language` (UI language code, e.g. `i18n.language`), `yesterdayLabel` (pre-translated "Yesterday"/"Ontem" string — kept out of this module to stay pure/testable, no `t()` call inside), `now` (injectable "current time", defaults to `new Date()`, exists for deterministic tests).
- `formatConversationTimestamp(iso, options)` (lines 28–50, critical) — the sole export. Parses `iso`, returns `""` for null/unparseable input; computes `differenceInCalendarDays(now, date)` and branches: `days <= 0` → `toLocaleTimeString` time-only (covers today and future clock-skew); `days === 1` → the passed-in `yesterdayLabel`; `days < 7` → `format(date, "EEE", { locale })` (weekday abbreviation); else → `format(date, "P", { locale })` (short localized date).

## Insights

- The function is deliberately pure and injectable (`now` param, pre-translated `yesterdayLabel`) specifically so it can be unit-tested without mocking `Date` or `i18next` — see `conversationTime.test.ts` in this same scope, which exercises exactly this seam.
- `days <= 0` (not `=== 0`) intentionally also covers negative day-differences from clock skew, treating a "future" timestamp the same as "today" rather than erroring or showing something nonsensical.
- Localization of the weekday/date branches goes through `dateFnsLocale(language)` (this scope), which itself defaults to `i18n.language` when no `language` is passed — but callers here are expected to always pass `language` explicitly (from `useTranslation()`) so the string updates correctly when the UI language changes.

## Connections

Uses: `./dateLocale` (`dateFnsLocale`, this scope) for weekday/date localization; `date-fns` (external) for `differenceInCalendarDays` and `format`.

Used by: `conversationTime.test.ts` (this scope, unit tests); the chat/conversation-list UI that renders message timestamps lives outside this scope (likely `@/components/messages/ConversationList`, imported by `MessagesPage.tsx`) — not confirmed by a resolved import in this slice, listed here as the evident intended consumer from the PAD-98 docstring.

## Query pointers

If you need to change how conversation timestamps are displayed, read this file and `conversationTime.test.ts` together — the tests pin the exact day-boundary behavior (today/yesterday/week/older). If the localized weekday or date string looks wrong for a given language, check `dateLocale.ts`'s `LOCALE_MAP` next.
