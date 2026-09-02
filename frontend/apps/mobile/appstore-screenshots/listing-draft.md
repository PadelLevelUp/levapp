# App Store Connect Listing — LevApp (Draft)

> Updated 2026-08-23 for the **LevApp 1.1.0** release (rebrand from PadelLevelUp).
> Live store version is 1.0; this release is 1.1.0, build 4.

Status: **DRAFT ONLY** — not submitted anywhere. Review and edit before entering into App Store Connect.

- Bundle ID: `com.padellevelup.app`
- Primary locale suggested: **Portuguese (Portugal)** — `pt-PT`
- Secondary locale: **English (U.S. or U.K.)** — `en-US` / `en-GB`
- Sources used: `apps/mobile/README.md`, root `.claude/CLAUDE.md`, `apps/web/src/App.tsx` (routes), `apps/web/src/pages/PrivacyPolicyPage.tsx` / `TermsPage.tsx`, `apps/web/src/locales/{pt,en}/auth.json`, `specs/_index.md`, `specs/evaluations/spec.md`, `specs/levels/spec.md`, `specs/training/spec.md`. There is no marketing landing page in the repo — `padellevelup.com` "/" is a protected route that redirects into the app, so no existing landing copy could be reused for tone; this draft is written from scratch based on actual product functionality.

---

## 1. App Name (30 char max)

**LevApp** (6 chars) — **CHANGED** from PadelLevelUp. Set in App Store Connect (listing name) and in `app.json` `expo.name` (the label under the icon). Bundle identifier stays `com.padellevelup.app` — changing it would create a separate App Store listing and invalidate the APNs push key.

⚠️ Confirm "LevApp" is available as an App Store name; Apple rejects names already claimed by another developer.

---

## 2. Subtitle (30 char max)

| Locale | Subtitle | Length |
|---|---|---|
| PT-PT | `Gestão de treino de padel` | 25 |
| EN | `Coach your padel academy` | 24 |

Alternates considered:
- PT: `A sua escola de padel, num app` (30, tight fit)
- EN: `Padel coaching, organized` (25)

---

## 3. Promotional Text (170 char max, editable without a new build)

**PT-PT** (126 chars):
> Aulas, jogadores e mensagens num só sítio. Organize a sua escola de padel sem folhas de cálculo nem grupos de WhatsApp a mais.

**EN** (118 chars):
> Classes, players, and messages in one place. Run your padel academy without spreadsheets or scattered WhatsApp groups.

---

## 4. Description (4000 char max)

### PT-PT (2,124 chars)

```
LevApp é a app para treinadores de padel que querem gerir a sua escola sem folhas de cálculo, papel ou dezenas de conversas de WhatsApp espalhadas.

Feita para treinadores independentes e escolas de padel, a app junta num só sítio tudo o que precisa para organizar aulas, acompanhar a evolução dos alunos e comunicar com a turma — no telemóvel, onde quer que esteja.

O QUE PODE FAZER

Calendário e aulas
Marque aulas recorrentes ou pontuais, veja a semana de um relance e registe presenças em segundos. Cada aula mostra os participantes, o nível-alvo e o histórico de assiduidade.

Gestão de alunos
Mantenha uma ficha por aluno com contactos, nível, pontos fortes e a melhorar, e histórico de aulas. Encontre rapidamente quem procura, filtre por nível e veja a evolução ao longo do tempo.

Avaliações de desempenho
Registe avaliações de desempenho por categoria — direita, esquerda, serviço, voleio, ou as que preferir — e acompanhe a evolução de cada aluno aula após aula.

Níveis à sua medida
Cada treinador define a sua própria escala de níveis (iniciante, intermédio, avançado, ou o que fizer sentido para a sua escola) para classificar alunos e montar aulas equilibradas.

Biblioteca de treino
Crie e organize exercícios com diagramas de campo, dificuldade e o nível a que se destinam — prontos a reutilizar em qualquer aula.

Mensagens em tempo real
Fale diretamente com os seus alunos dentro da app, sem depender de grupos externos. Veja as mensagens novas em tempo real, assim que chegam.

Disponibilidade dos alunos
Os alunos indicam quando estão disponíveis, ajudando-o a preencher vagas e a propor horários que encaixam.

PARA QUEM É

Treinadores de padel que gerem alunos particulares, turmas de clube ou uma academia inteira, e querem trocar caderno, Excel e WhatsApp por uma ferramenta pensada de raiz para o ensino do padel.

Também para alunos: consulte as suas aulas, indique a sua disponibilidade e fale diretamente com o seu treinador — tudo na mesma app.

LevApp fala a mesma linguagem da web app padellevelup.com — os seus dados sincronizam automaticamente entre o telemóvel e o computador.
```

### EN (1,994 chars)

```
LevApp is the app for padel coaches who want to run their academy without spreadsheets, paper notes, or a dozen scattered WhatsApp chats.

Built for independent coaches and padel academies, it brings everything you need to schedule classes, track student progress, and stay in touch with your players into one place — right on your phone.

WHAT YOU CAN DO

Calendar & classes
Schedule recurring or one-off classes, see your week at a glance, and mark attendance in seconds. Every class shows its participants, target level, and attendance history.

Player management
Keep a profile for every student with contact details, skill level, strengths and weaknesses, and class history. Search, filter by level, and track progress over time.

Skill evaluations
Log skill evaluations by category — forehand, backhand, serve, volley, or whatever you've set up — and track each student's progress class after class.

Levels, your way
Every coach sets their own level hierarchy (beginner, intermediate, advanced, or anything that fits your academy) to classify players and put together balanced classes.

Training library
Build and organize a library of exercises with court diagrams, difficulty ratings, and target levels — ready to reuse in any class.

Real-time messaging
Message your players directly inside the app instead of relying on outside group chats — new messages show up live, the moment they arrive.

Player availability
Students share when they're free, so you can fill open slots and propose times that actually work.

WHO IT'S FOR

Padel coaches managing private students, club classes, or a full academy — anyone ready to trade notebooks, spreadsheets, and WhatsApp for a tool built specifically for coaching padel.

Students too: check your upcoming classes, share your availability, and message your coach directly — all in the same app.

LevApp speaks the same language as the padellevelup.com web app — your data syncs automatically between your phone and your computer.
```

Notes:
- Verified in mobile source (`apps/mobile/src/features/players/add-evaluation-form.tsx`, `hooks.ts`): the app **can** log evaluation entries (score a player against existing categories) but **cannot** create or edit the categories themselves — that's coach-web-only (matches the README's "category editor not in mobile scope"). Wording above ("log... whatever you've set up" / "registe... ou as que preferir") reflects exactly that: it describes scoring against categories without claiming in-app category creation, so it won't misrepresent the binary under Apple Guideline 2.3.1 (metadata must match actual app functionality).
- Push notifications are stubbed/incomplete on mobile (`PUSH_TOKEN_ENDPOINT` is `null` in `expoPushRegistrar.ts`) — an earlier draft of the messaging bullet said notifications fire "when a class is about to start," which would only be true via background push. Corrected to describe only the real-time (SSE, in-app) messaging behavior that actually exists, since a class-start reminder claim would misrepresent the binary.
- "Schedule recurring or one-off classes" and "Every coach sets their own level hierarchy" were both verified against mobile source, not assumed: `app/class/new.tsx` has a working `isRecurring` toggle with weekday + end-date fields, and `src/features/settings/coach-levels-section.tsx` has full add/edit/delete for coach levels (not view-only). Both claims are accurate for the iOS binary.
- Both descriptions now explicitly cover the student audience (students can view their schedule, submit availability, and message their coach — confirmed via the README's Maestro coverage table: `14-student-calendar.yaml`, `13-student-availability.yaml`, direct-messages flow).

---

## 5. Keywords (100 char max, comma-separated, no spaces)

**PT-PT** (97 chars):
```
treinador,treino,aulas,calendario,alunos,avaliacao,academia,escola,gestao,niveis,jogadores,turmas
```

**EN** (99 chars):
```
coach,coaching,training,classes,schedule,calendar,players,students,evaluation,academy,levels,skills
```

("padel" itself doesn't need to be a keyword — it's already in the app name and gets indexed automatically; no accents used in PT keywords since App Store keyword matching is accent-insensitive but some tooling strips them anyway, e.g. "calendario" not "calendário".)

---

## 6. Support URL — ⚠️ ACTION REQUIRED, NOT FOUND

**No live support/contact page exists.** I checked:
- `apps/web/src/App.tsx` — only routes are `/privacy` and `/terms` (plus app routes behind auth); there is no `/support` or `/contact` route.
- `padellevelup.com` root `/` is a **protected route** that redirects into the dashboard/login — it is a SPA app shell, not a marketing/support site (confirmed live: fetching it returns just "Level Up" with no footer, no contact links).
- The only contact info anywhere is a `mailto:` link inside `/privacy` and `/terms`, using **`privacy@levelup.app`** — a domain that does **not match** the live `padellevelup.com` domain. This mismatch should probably be fixed regardless of the App Store submission.

Apple requires the Support URL to be a **live, working webpage** — a bare `mailto:` link or a placeholder is not accepted, and the URL is checked by an automated crawler as part of review.

- `https://www.padellevelup.com/terms` is **not a safe fallback**, despite being a real route: the site is a client-rendered React SPA, and I already confirmed by fetching the live domain that an unauthenticated crawl of it returns only the bare text "Level Up" with no rendered content (no privacy/terms/contact links, no footer) — this is almost certainly what Apple's crawler will see too on any route under this domain, `/terms` included, unless it executes JS the way a browser does.
- **Effectively required**: stand up a real, server-rendered (or at least crawlable/pre-rendered) support page — even a single static HTML page with a contact email and a short "how to get help" blurb is enough — before submission. Also update the contact email off `privacy@levelup.app` (mismatched domain) to something on `padellevelup.com` (e.g. `support@padellevelup.com`) for consistency and credibility.

**I did not fabricate a URL for this field — this is a hard blocker for submission, not a nice-to-have.**

---

## 7. Marketing URL (optional)

```
https://www.padellevelup.com
```

---

## 8. What's New in This Version (4000 char max)

> Rewritten for 1.1.0. The previous first-release copy is in `listing-draft.md.bak`.

### PT-PT
```
Passámos a chamar-nos LevApp — novo nome, nova imagem.

Nesta versão:
- Nova identidade: novo nome, novo ícone e um visual renovado de ponta a ponta
- Notificações push: seja avisado quando um aluno lhe envia mensagem, mesmo com a app fechada
- A app passa a atualizar-se quando volta a abri-la, sem ser preciso fechá-la e abri-la de novo
- Painel do treinador redesenhado
- Correções e melhorias de desempenho
```

### EN
```
We're now LevApp — new name, new look.

In this version:
- New identity: new name, new icon, and a refreshed design throughout
- Push notifications: get alerted when a student messages you, even with the app closed
- The app now refreshes when you reopen it, instead of needing a restart
- Redesigned coach dashboard
- Fixes and performance improvements
```
