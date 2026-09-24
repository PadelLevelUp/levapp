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
4. **A pushed route that paints its own navy top sets light content itself.** In a native stack
   the light `Screen` beneath stays mounted with its dark style, so a pushed route that paints navy
   under the status bar renders `<StatusBar style="light" />`. Navy is either marker: the
   `lightTheme.sidebarBackground` token (settings, the conversation screens, the class-request
   wizard) or the `bg-sidebar` class (connect, verify-email, login, signup, forgot-password,
   coach-pending, club-onboarding; PAD-434). A stack root carries it too, so it stays right if a
   route that is a root today is later pushed (`/connect` already is, from the student dashboard). Mounted later, it wins while shown,
   and unmounting it gives the screen beneath its dark content back. A source scan over every
   non-tab route pins this (`src/lib/status-bar-navy-screens.test.ts`; Session-B's #415 review).
5. **Web is out of scope.** The browser draws its own bar. The web app's `theme-color`
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

#### A navy route pushed over a light screen shows light content
- **Given** a route file outside `(tabs)` that paints `lightTheme.sidebarBackground` (such as `app/conversation/[id].tsx`) or the `bg-sidebar` class (such as `app/connect.tsx`; PAD-434)
- **When** the route files are scanned
- **Then** it renders `<StatusBar style="light" />`

### Notes
- Swept on staging `1c7c249a1`: 16 files render `Screen` with a top edge. They are the evaluation
  screens, player detail and new, class detail and new, event detail and new, attendance and
  absences. All paint the light background, and none overrides it. The routes that don't use
  `Screen` (auth, onboarding, invites, settings, conversations) paint navy and are covered by
  rule 1.
