---
name: design-tokens
---

# design-tokens

LevApp's single source of truth for the navy-and-blue brand palette and type stack, defined once as raw HSL/font values and consumed two ways: CSS-string form for web (hand-mirrored into `apps/web/src/index.css`, outside this scope) and a resolved-color React-Native shape for mobile (`nativewindTheme()`). The system assigns exactly one semantic job per hue (blue = identity/primary action, green = done/confirmed ONLY, amber = needs-coach-attention) and treats deviation as a bug.

**Implementing files:**
- `frontend/packages/config/src/tokens.ts` — the token values (`lightThemeHsl`/`darkThemeHsl`), the `ThemeHsl` shape, and `nativewindTheme()`.
- `frontend/packages/config/src/tokens.test.ts` — pins the values and cross-checks them against `apps/web/src/index.css`.
- `frontend/packages/config/src/calendar-status.ts` — the one in-scope consumer of `lightTheme`/`darkTheme`, using them to resolve concrete colors for its React-Native color-blend emitters.

**Related concepts:** [[calendar-visual-state]] — depends on this concept's surface colors for its contrast/fade math.
