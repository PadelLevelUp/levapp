LevApp's non-obvious, app-wide visual rules, independently restated as inline comments across five unrelated `ui/` primitives rather than centralized in one place: hover/press states darken via a brightness shift rather than an opacity fade, border radius rises with a component's size/role (a chip is not a card), the app's single shadow family is reserved for elements that genuinely float above content, and green is reserved to mean only "done/confirmed" — never picked for plain visual variety. The green/blue rule traces back to `@levelup/config`'s `tokens.ts`, the actual source both `apps/web` and `apps/mobile` mirror.

## Implemented by
`frontend/apps/web/src/components/ui/badge.tsx`
`frontend/apps/web/src/components/ui/button.tsx`
`frontend/apps/web/src/components/ui/card.tsx`
`frontend/apps/web/src/components/ui/occupancy-bar.tsx`
`frontend/apps/web/src/components/ui/toast.tsx`

## Related concepts
[[design-tokens]]
