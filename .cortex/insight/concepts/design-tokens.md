The single source of truth for LevApp's navy-and-blue brand palette and type scale, defined once in `@levelup/config` and hand-mirrored (not imported) into each client's own styling system: apps/web's Tailwind config and global stylesheet restate the same HSL values, and apps/mobile's `nativewindTheme()` derives its color blocks from the same token shape. Because the mirror is copy-paste rather than a shared import, `tokens.test.ts` reads the web CSS file at test time to catch drift.

## Implemented by
`frontend/packages/config/src/tokens.ts`
`frontend/packages/config/src/tokens.test.ts`
`frontend/apps/web/src/index.css`
`frontend/apps/web/tailwind.config.ts`
`frontend/apps/mobile/tailwind.config.js`

## Related concepts
[[levapp-visual-design-conventions]]
[[calendar-visual-state]]
