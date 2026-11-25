---
id: auth.invite-welcome
status: draft
depends_on: [players.join-token, players.invite-completion, players.claim, clubs.coach-invitation, auth.mobile-account-creation]
serves: [P-PLAYERS-2]
governed_by: []
---

# auth.invite-welcome

### Intent
The first page a newcomer sees from a link or a code welcomes them: what they were invited to stands on a navy band, with one
main button below it. UI idea 8; owner's yes to the sketch, 2026-11-25 ("yes 1, 3, 6, 7, 8, 10, 12"): layout, not facts or steps.

### Rules
1. **Pages.** The join page (`/join/coach/:token`), the coach invitation (`/invite/coach/:token`) and the player invitation
   (`/invite/player/:token`), on web and iOS. The public site, sign-in, sign-up, `RegisterScreen`, the legal catch-up and every
   other user of the shared pieces (`PreAuthShell`, `AccountSetupForm`, `AccountSetupNotice`) look and behave as today.
2. **The band.** Every state of these pages except loading and invalid opens with a flat navy band (`invite-band`, the `sidebar` tokens, no
   gradient): the LevApp mark, then the state's own title and description, in the words they have today. The state's round
   icon goes: the mark stands there. Below it one card holds what the state's card held under those two lines: fields, errors, buttons,
   with the state's own id still around them. Web's card overlaps the band's lower edge; iOS, already navy, moves the two lines out of the card.
3. **The join page names the coach.** Signed out and in the preview, the band's headline is the coach's name in the display face with the
   club's name under it, as in the sketch; today's title and description follow as text. The coach's name is display text, not a heading (rule 4). On web the signed-in
   preview's club logo stands beside them; signed out shows no logo. Both names are public by `players.join-token` rule 4. Signed out gains only the club's name; no state of
   the two invitation pages shows a name, club or logo it does not show today, before or after sign-in.
4. **Nothing else changes.** Order, steps, copy, ids, accessible names, errors, redirects, focus, and each state's one primary action, full width
   and at least 44px high; a state whose only action is outlined today keeps it so. The title stays a heading at
   the level it has today, on each shell, and is the page's first heading.
5. **Invalid and loading** stay as they are.
6. **Reading it.** Text on the band has a contrast of at least 4.5:1 in both themes (blue on navy is 2.8:1 and is not used for text). In web's dark
   theme the band is told from the page by a hairline (`sidebar-border`). A long name or title wraps, broken if need be; at 320px nothing scrolls sideways.
   On iOS every screen scrolls, the keyboard never covers the field being typed in, larger text wraps, and the player page's
   sign-in link sits in the flow under the form, not over it.

### Not this spec
- Telling an invited player or coach who invited them before sign-in (see Open questions).
- The 44px of text links, and the differences between web and iOS in which action is primary when a coach opens a player's link.
- The wording of any page.

### Today
- Web `pages/JoinCoachPage.tsx` draws a lockup and a card (its `shell`), each state with a round icon; `CoachInvitePage.tsx` and `PlayerInvitePage.tsx` draw
  a centred card with no mark. Web titles are `CardTitle` (an h3; the pages have no h1). iOS `features/players/JoinCoachScreen.tsx` has its own navy shell with no
  `ScrollView`; `CoachInviteScreen.tsx` and `PlayerInviteScreen.tsx` use `PreAuthShell` and `AccountSetupForm` / `AccountSetupNotice` (`features/auth/AccountSetupScreen.tsx`),
  shared with `RegisterScreen.tsx`, `app/legal-catch-up.tsx` and the invalid states. `PlayerInviteScreen.tsx` pins its sign-in link over the form, muted on navy.
- Who is known before sign-in: the join preview gives the coach's name, the club's name and logo (`player_join_service.py`); the signed-out page shows the
  coach only. A coach invitation gives the club's name; a player invitation the invited player's own name.
- Pinned by ids (`join-coach-*`, `invite-claim*`, `coachInvite-*`, `playerInvite-*`), labels and visible text in `join-by-qr`, `merge-qr-duplicate`,
  `profile-completeness`, `coach-invitation`, `player-invite-completion`, `claim-existing-account`, `ticket-pad-105` and `duplicate-username-warning` (Playwright);
  `join-coach-copy`, `join-coach-screen`, `CoachInvitePage`, `PlayerInvitePage`, iOS account-setup, country-on-completion and status-bar tests; Maestro 113. None reads
  the layout. not read in the code: Maestro 113 in full, the iOS forms' fields.

### Acceptance Criteria

#### AUTH-INVITE-WELCOME-1: Every web state shows its words on the band and keeps its controls (rules 2, 3, 4)
- **Given** each state of the three web pages except loading and invalid
- **Then** `invite-band` holds its title, as a heading of the level it has today, and its description; the join page's signed-out and preview states also hold the coach's and the club's name; the state's id surrounds the same controls, with the same names and calls; invalid and loading render as today
test: `frontend/apps/web/src/pages/inviteWelcome.test.tsx` › `every state shows its words on the band and keeps its controls`

#### AUTH-INVITE-WELCOME-2: The same on iOS, and the shared screens do not change (rules 1, 2, 3, 4)
- **Given** each state of the three iOS screens, and Register, the legal catch-up and the invalid notices
- **Then** the former hold the heading and description outside the card with the same controls and the join names of rule 3, and the latter render as today
test: `frontend/apps/mobile/src/features/auth/invite-welcome.test.tsx` › `every state shows its words on the navy and the shared screens do not change`

#### AUTH-INVITE-WELCOME-3: Nothing new is revealed before sign-in (rule 3)
- **Given** the three public previews with a sentinel in every field, including fields no page shows
- **Then** each signed-out page, on web and iOS, shows only the strings listed for it (the join page's list gains the club; the mark's own name is excepted), and the three endpoints' key sets are unchanged
test: `frontend/apps/web/src/pages/inviteWelcome.test.tsx` › `the signed-out pages reveal only the listed facts` (+ iOS: `invite-welcome.test.tsx`, and `backend/padel_app/tests/test_invite_previews_keys.py` › `test_public_preview_key_sets`)

#### AUTH-INVITE-WELCOME-4: The band fits a phone and both themes on web (rule 6)
- **Given** a signed-in join preview with a long unbroken coach's name and club, and the longest invite form, at 320px and 1280px, light and dark
- **Then** the page does not scroll sideways, the band's text has a contrast of at least 4.5:1 with it, in dark the hairline is there, the primary action is at least 44px high and the form can be completed
test: `frontend/apps/web/e2e/auth/invite-welcome.spec.ts` › `the band fits a phone and both themes`

#### AUTH-INVITE-WELCOME-5: iOS screens scroll and the keyboard covers no field (rule 6)
- **Given** the join preview at the largest text size and the player form with the keyboard up on the last field
- **Then** the primary action can be scrolled to and tapped, the field being typed in is visible, and the sign-in link is under the form
test: `frontend/apps/mobile/.maestro/flows/331-invite-welcome.yaml` › `331-invite-welcome`

### Waves
1. 1, 3, 4 — web, and the key-set test.
2. 2, 5 — iOS, with a look on the simulator. Web and iOS are one PR.

### Open questions
- **Who invited you.** The sketch said "A Ana convidou-te" over the club. The join page follows it with the names alone (rule 3), in no new
  words. The two invitation pages do not know who invited, and showing the coach's name there would be new public information. Options:
  leave it out (built so); send the coach's name and club in the player-invitation preview (a privacy decision and an amendment of
  `players.invite-completion`). Asked 2026-11-25, for the owner.
- **Page grey, navy and white** make three surfaces, one more than the design system's two. The band is the sketch the owner approved; the exception is recorded here.
- **Wording, found while reading:** the join page says *tu* ("Estás na base de alunos…") and the two invite pages say *você* ("Complete o seu perfil",
  "Foi convidado"). The product's rule is *tu*. Not changed here (rule 3). For the owner.
