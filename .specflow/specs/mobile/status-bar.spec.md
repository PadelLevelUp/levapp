---
id: mobile.status-bar
status: implementing
depends_on: []
implements: ../../specs-business/mobile/system-bar-stays-readable.business.md
governed_by: []
---

# mobile.status-bar

### Intent
The iOS status bar (clock, signal, battery) must contrast with what the app paints beneath it.
The root layout sets one style for the whole app, white text for the navy headers. The screens
that paint the top inset with the light background inherited that white text and showed a
near-invisible status bar (PAD-419; D136).

### Entities
- None. This is presentation only.

### Rules
1. **The default is light content.** `app/_layout.tsx` renders `<StatusBar style="light" />` from
   `expo-status-bar`, because the tab headers, the sign-in and onboarding screens (`bg-sidebar`),
   settings and the conversation screens all paint navy behind the status bar.
2. **A light screen asks for dark content while it is shown.** The shared `Screen` component
   (`src/components/screen.tsx`) paints its top safe-area inset with the light background
   whenever it owns the top edge (`edges` includes `"top"`, or it renders a `title`). In that
   case it renders `<StatusBar style="dark" />`. A `Screen` that doesn't own the top edge (every
   tab screen) renders none, and the navigator's navy header keeps the default.
3. **The last mounted style wins, and leaving a screen restores the previous one.** This is
   `expo-status-bar`'s stacking. Going back from a light pushed screen to a tab restores light
   content with no extra code.
4. **Web is out of scope.** The browser draws its own bar. The web app's `theme-color`
   (`#0B1524`) and `apple-mobile-web-app-status-bar-style` (`default`) are fixed, and the
   browser picks a contrasting text colour itself.

### Acceptance Criteria

#### A pushed light screen gets dark content
- **Given** the player evaluations screen, a `Screen` with `edges={["top"]}` over the light background
- **When** it is shown
- **Then** it renders a `StatusBar` whose `style` is `"dark"`

#### A tab screen keeps the navy default
- **Given** a `Screen` with no `edges` and no `title`, as every tab screen is
- **When** it is shown
- **Then** it renders no `StatusBar` of its own, and the root's `"light"` applies

#### A titled screen gets dark content
- **Given** a `Screen` with `title="Aula"` and no `edges`, which owns the top edge through its title
- **When** it is shown
- **Then** it renders a `StatusBar` whose `style` is `"dark"`

### Notes
- Swept on staging `1c7c249a1`: 16 files render `Screen` with a top edge. They are the evaluation
  screens, player detail and new, class detail and new, event detail and new, attendance and
  absences. All paint the light background, and none overrides it. The routes that don't use
  `Screen` (auth, onboarding, invites, settings, conversations) paint navy and are covered by
  rule 1.
