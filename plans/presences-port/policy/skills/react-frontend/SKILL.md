---
name: react-frontend
description: Patterns and conventions for building React + TypeScript frontend apps with Vite, Tailwind, and shadcn/ui. Use when creating components, pages, hooks, API modules, forms, or routing — or when reviewing React code for anti-patterns.
---

# React Frontend Development

Use this skill when creating or modifying React frontend applications. It codifies proven patterns and guards against common anti-patterns.

## Stack

- **Build:** Vite + `@vitejs/plugin-react`
- **Language:** TypeScript (strict mode — `noImplicitAny`, `strictNullChecks` enabled)
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Routing:** React Router v6
- **Validation:** Zod
- **HTTP:** Axios with interceptors
- **Testing:** Vitest + React Testing Library (unit), Playwright (E2E)

## Core Rules

These rules apply to ALL React code. They are non-negotiable.

1. **Functional components only.** No class components.
2. **Type everything.** Never use `any` — use `unknown` and narrow, or define proper types. Type all props, API request/response bodies.
3. **Components under 300 lines.** Extract sub-components or custom hooks when exceeding this.
4. **Handle all async states.** Every data-fetching operation needs loading, error, and empty states.
5. **Never store derived state.** Compute it with `useMemo`.
6. **Clean up effects.** Return cleanup functions for subscriptions, timers, AbortControllers.
7. **Never swallow errors.** No empty `catch {}` blocks. Always inform the user via toast.
8. **Semantic HTML + accessibility.** Use `<button>` not `<div onClick>`. Labels on inputs. `aria-label` on icon-only buttons.
9. **No tokens in URLs.** Use headers or cookies for auth, especially with EventSource/SSE.
10. **Lazy-load pages.** Use `React.lazy()` + `<Suspense>` for route-level code splitting.

## Directory Structure

```
src/
├── api/              # One file per feature, typed async functions
├── auth/             # AuthContext, guards, token management
├── components/
│   ├── ui/           # shadcn/ui primitives (don't modify)
│   ├── layout/       # App shell, sidebar, nav
│   └── {feature}/    # Feature-specific components
├── hooks/            # Custom React hooks
├── pages/            # One per route (PascalCase + Page suffix)
├── types/            # Shared TypeScript types
├── state/            # Global state (Context, listeners)
├── utils/            # Pure utility functions
├── lib/              # Third-party wrappers (cn utility)
├── App.tsx           # Route definitions
├── main.tsx          # Entry point
└── index.css         # Tailwind directives + CSS custom properties
```

## Naming

| Item | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `PlayerHeader.tsx` |
| Pages | PascalCase + `Page` | `CalendarPage.tsx` |
| Hooks | camelCase + `use` | `useCalendar.ts` |
| API modules | camelCase | `players.ts` |
| Types | PascalCase | `CoachPlayer` |

## Imports

```typescript
// 1. React/libraries
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
// 2. Types (use `import type`)
import type { CoachPlayer } from "@/types";
// 3. Project imports via @/ alias
import { Button } from "@/components/ui/button";
import { getPlayers } from "@/api/players";
```

## Checklist for New Features

- [ ] Types defined for all data shapes (no `any`)
- [ ] Loading, error, and empty states handled
- [ ] Form inputs validated with Zod before submit
- [ ] Callbacks memoized with `useCallback` when passed as props
- [ ] Expensive computations wrapped in `useMemo`
- [ ] Effects have cleanup functions (AbortController for fetches)
- [ ] Accessible: labels, aria-labels, semantic HTML
- [ ] Toast feedback for user actions (success and failure)
- [ ] Error boundary wrapping the feature
- [ ] Component under 300 lines
- [ ] Lazy-loaded if it's a page

## Parity: the web app is half the feature

This repo ships a web shell AND an Expo/iOS shell from one monorepo. A feature
added to `apps/web` must also land in `apps/mobile` in the same ticket unless
there is a very strong reason not to — see `levelup_frontend/CLAUDE.md`.

Keep behaviour in `packages/*` (types, api, hooks, validation) so the shells can
only diverge in presentation. Mobile has no shadcn and no Recharts; it uses
`react-native-reusables` and `react-native-svg`, and its i18n namespaces are
**static imports**, not a glob.

## Anti-Patterns to Avoid

1. Prop drilling beyond 2 levels — use Context or composition
2. Storing derived state — compute with `useMemo`
3. Giant components (500+ lines) — split into sub-components + hooks
4. `useEffect` for user-initiated actions — use event handlers instead
5. Inline arrow functions in JSX for child callbacks — use `useCallback`
6. Empty catch blocks — always report errors to user
7. Missing request cancellation — use `AbortController`
8. Duplicate utility code — extract to `utils/`
9. Disabling ESLint rules — fix the underlying issue
10. `console.error` as only error handling — always show toast

## Reference Material

For detailed patterns with code examples, see:

- [Component patterns](references/components.md) — composition, memoization, code splitting
- [State management](references/state.md) — state layers, Context, derived state, union state
- [Data fetching & API](references/data-fetching.md) — Axios setup, API modules, cancellation, optimistic updates, SSE
- [Forms](references/forms.md) — Zod validation, controlled components, error display
- [Routing & auth](references/routing.md) — route setup, guards, RBAC
- [Styling](references/styling.md) — Tailwind conventions, shadcn/ui, theming
- [Error handling](references/errors.md) — toasts, error boundaries, async patterns
- [TypeScript](references/typescript.md) — strict config, discriminated unions, type organization
- [Testing](references/testing.md) — Vitest, RTL, Playwright, what to test per layer
