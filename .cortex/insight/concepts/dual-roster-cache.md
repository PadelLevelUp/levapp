Two independent, unaware-of-each-other caching mechanisms sit over the same coach-players roster data: `@levelup/api`'s `players.ts` resource keeps its own module-level TTL cache, entirely separate from the TanStack Query cache the rest of the app's data fetching relies on and that `queryKeys.ts` backs. Neither invalidates the other, so a write through one path can leave the other stale — flagged here as a consolidation candidate, not yet acted on.

## Implemented by
`frontend/packages/api/src/resources/players.ts`
`frontend/packages/hooks/src/queryKeys.ts`

## Related concepts
[[auth-session]]
