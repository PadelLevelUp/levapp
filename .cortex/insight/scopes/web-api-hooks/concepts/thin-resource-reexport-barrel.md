---
name: thin-resource-reexport-barrel
---

# thin-resource-reexport-barrel

Five `api/*.ts` files (`availability.ts`, `fields.ts`, `invitations.ts`, `notificationEngine.ts`, `playerInvitations.ts`) are content-free: `import "@/api/client"` (or `"./client"`) for the `initApi()` side effect, then `export * from "@levelup/api/src/resources/<name>"`. Two `hooks/*.ts` files follow the same shape one level up (`useAutoInviteEnabled.ts`, `useFieldAvailability.ts` re-export from `@levelup/hooks`; `useCalendar.ts` does the same but skips the `client` import since its underlying hook makes no `getApi()` calls). The pattern exists purely so web code can import under the app's own `@/api/*`/`@/hooks/*` alias convention rather than reaching into `@levelup/api`/`@levelup/hooks` directly — none of these seven files have web-specific logic, a mock branch, or wrapping to add.

**Implementing files:**
- `frontend/apps/web/src/api/availability.ts`, `fields.ts`, `invitations.ts`, `notificationEngine.ts`, `playerInvitations.ts`.
- `frontend/apps/web/src/hooks/useAutoInviteEnabled.ts`, `useCalendar.ts`, `useFieldAvailability.ts`.

**Related concepts:** [[mock-real-data-switch]] — the sibling pattern for resources that DO need a demo-mode branch.
