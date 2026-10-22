# LevApp on Google Play — release prep (PAD-216)

Status: **prepared, not published.** Data safety and target audience were brought up to date on
2026-10-22 (PAD-608). Owner decision 2026-09-09: prepare only. Nothing here uploads,
submits or publishes anything. The Android build config lives in `../../app.json` (`expo.android`)
and `../../eas.json`; this folder holds what the Play Console listing needs.

## Owner prerequisites — checklist

These can only be done by the owner (accounts, payment, keys). Each unblocks a later step.

- [ ] **Google Play Console developer account** — one-time 25 USD. Recommended owner:
      `admin@levapp.app`, matching the Apple account arrangement until a legal entity exists.
- [ ] **Expo login for EAS** on the building machine — `npm i -g eas-cli && eas login` with the
      `levapps-team` account (the `owner` in `app.json`). Needed for the recommended build path.
- [ ] **Signing key** — let EAS generate and store the upload keystore on the first Android build
      (`eas build` asks), and enrol the app in **Play App Signing** when creating it in Play Console.
      Afterwards run `eas credentials -p android` and keep both SHA-256 fingerprints (upload key and
      Play app-signing key) — the App Links file below needs them.
- [ ] **Firebase project + `google-services.json`** — Android push goes through Firebase Cloud
      Messaging; iOS push does not use it. Create a Firebase project, add an Android app with package
      `com.padellevelup.app`, download `google-services.json` to `frontend/apps/mobile/`, then add
      `"googleServicesFile": "./google-services.json"` under `expo.android` and upload the FCM V1
      service-account key to Expo (`eas credentials -p android` → Push Notifications). Until this
      exists the Android build works but receives no push; the listing below makes no push claim.
- [ ] **Play service account JSON** for `eas submit` (Play Console → Setup → API access). Only when
      the owner decides to upload; `eas.json` sends a submit to the **internal** track as a
      **draft**, never to production.
- [ ] **Audience decision** (see "Target audience" below) — whether the Play listing declares
      users under 13, which brings Google's Families Policy into scope.

## Build paths

This machine has no Android SDK, emulator or `adb`, its only JDK is 23 (Android Gradle needs 17),
and `eas-cli` is not installed, so no build was made here (coordinator decision 2026-09-10: no SDK
install, no cloud build). The config was validated with `npx expo config` and an offline
`npx expo prebuild --platform android --no-install`, which generates the native project without the
SDK: package `com.padellevelup.app`, `versionCode 1`, the App Links intent filter, and only the
`INTERNET` and `VIBRATE` permissions from the Expo template (three unused template permissions are
blocked in `app.json`).

### Recommended — EAS cloud build

```bash
cd frontend/apps/mobile
eas build -p android --profile preview      # installable APK: open the link on a device or emulator
eas build -p android --profile production   # app bundle (.aab) for Play Console
```

### Local — only if an emulator run is wanted on a Mac

```bash
brew install --cask android-studio zulu@17       # then, in Android Studio: SDK 35, an emulator image
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd frontend/apps/mobile
npx expo prebuild --platform android             # android/ is gitignored (continuous native generation)
cd android && ./gradlew assembleRelease          # signed with the debug key unless a keystore is set up
adb install app/build/outputs/apk/release/app-release.apk
```

The Maestro flows use the same `appId` (`com.padellevelup.app`) and run against an Android emulator
with `maestro test` unchanged, once a build is installed.

## Listing text

Title (30 max): **LevApp**

| | Short description (80 max) | Length |
|---|---|---|
| pt-PT | Aulas, alunos, avaliações e mensagens da tua escola de padel, num só sítio. | 75 |
| en | Classes, players, evaluations and messages for your padel academy, in one app. | 78 |

Full description (4000 max) — adapted from the App Store draft (`../../appstore-screenshots/listing-draft.md`),
with the domain moved to levapp.app and **no push-notification claim** until Firebase is set up.

### pt-PT (1833 characters)

```
LevApp é a app para treinadores de padel que querem gerir a sua escola sem folhas de cálculo, papel ou dezenas de conversas de WhatsApp espalhadas.

Feita para treinadores independentes e escolas de padel, junta num só sítio tudo o que precisa para organizar aulas, acompanhar a evolução dos alunos e comunicar com a turma — no telemóvel, onde quer que esteja.

O QUE PODE FAZER

Calendário e aulas
Marque aulas recorrentes ou pontuais, veja a semana de um relance e registe presenças em segundos. Cada aula mostra os participantes, o nível-alvo e o histórico de assiduidade.

Gestão de alunos
Mantenha uma ficha por aluno com contactos, nível, pontos fortes e a melhorar, e histórico de aulas. Encontre rapidamente quem procura, filtre por nível e veja a evolução ao longo do tempo.

Avaliações de desempenho
Registe avaliações por categoria — direita, esquerda, serviço, voleio, ou as que tiver definido — e acompanhe a evolução de cada aluno aula após aula.

Níveis à sua medida
Cada treinador define a sua própria escala de níveis para classificar alunos e montar aulas equilibradas.

Biblioteca de treino
Crie e organize exercícios com diagramas de campo, dificuldade e nível-alvo — prontos a reutilizar em qualquer aula.

Mensagens em tempo real
Fale diretamente com os seus alunos dentro da app, sem depender de grupos externos. As mensagens novas aparecem assim que chegam.

Disponibilidade dos alunos
Os alunos indicam quando estão disponíveis, ajudando-o a preencher vagas e a propor horários que encaixam.

PARA QUEM É

Treinadores de padel que gerem alunos particulares, turmas de clube ou uma academia inteira. E também alunos: consulte as suas aulas, indique a sua disponibilidade e fale com o seu treinador — tudo na mesma app.

Os seus dados sincronizam automaticamente entre o telemóvel e a versão web em levapp.app.
```

### en (1689 characters)

```
LevApp is the app for padel coaches who want to run their academy without spreadsheets, paper notes, or a dozen scattered WhatsApp chats.

Built for independent coaches and padel academies, it brings everything you need to schedule classes, track student progress and stay in touch with your players into one place — right on your phone.

WHAT YOU CAN DO

Calendar & classes
Schedule recurring or one-off classes, see your week at a glance, and mark attendance in seconds. Every class shows its participants, target level and attendance history.

Player management
Keep a profile for every student with contact details, skill level, strengths and weaknesses, and class history. Search, filter by level and track progress over time.

Skill evaluations
Log evaluations by category — forehand, backhand, serve, volley, or whatever you have set up — and track each student's progress class after class.

Levels, your way
Every coach sets their own level scale to classify players and put together balanced classes.

Training library
Build a library of exercises with court diagrams, difficulty and target level — ready to reuse in any class.

Real-time messaging
Message your players directly inside the app instead of relying on outside group chats. New messages show up the moment they arrive.

Player availability
Students share when they are free, so you can fill open slots and propose times that actually work.

WHO IT'S FOR

Padel coaches managing private students, club classes or a full academy. Students too: check your classes, share your availability and message your coach — all in the same app.

Your data syncs automatically between your phone and the web version at levapp.app.
```

- Category: **Sports**. Tags: coaching, sports management.
- Contact email: `admin@levapp.app` · Website: `https://levapp.app` · Support: `https://levapp.app/support`
- Privacy policy (required): `https://levapp.app/privacy` · Terms: `https://levapp.app/terms`

## Graphic assets

| Asset | Play requirement | Status |
|---|---|---|
| App icon | 512 × 512 PNG, up to 1 MB | `icon-512.png` here (from `assets/icon.png`) |
| Feature graphic | 1024 × 500 JPEG or 24-bit PNG, no transparency | **draft, owner picks** (PAD-608): `feature-graphic.png` ("Mais turmas cheias. Menos mensagens para gerir.") or `feature-graphic-alt-whatsapp.png` (the site's own line, "Menos horas no WhatsApp"). The second names a third-party brand, which Play's metadata policy can flag, hence the default. Both are 1024 × 500 RGB without alpha, rendered from `feature-graphic-source/feature-graphic.html` (site navy, the on-dark lockup, Poppins and Plus Jakarta Sans from `@fontsource`) with Playwright's Chromium. |
| Phone screenshots | 2–8, JPEG or 24-bit PNG, each side 320–3840 px, long side at most 2× the short side | **to make**. The iOS set in `../../appstore-screenshots/` is 1320 × 2868 (ratio 2.17), which Play rejects. Shoot Android screenshots from an emulator with a 1080 × 1920 profile: the CI lane's pixel_6 is 1080 × 2400, ratio 2.22, also too tall. Use a throwaway DB and fictional names. The 1.2.0 iOS set (`~/levapp-appstore-shots-1.2.0/`) is the content reference. |
| Tablet screenshots | only if tablets are targeted | not needed for v1 |
| Adaptive icon | foreground on a background colour | `assets/adaptive-icon.png` on `#ffffff` (configured) |

Marketing screenshots must use fictional names (repaint real players' names, keep the initials).

## Data safety form — answers (PAD-608, decided 2026-10-21)

Sources: the Privacy Policy **v2026-10-14** (`apps/web/src/content/legal/en/privacy.md`, served
at https://levapp.app/privacy) and the Android app's code. PAD-608 holds the evidence for each row.

General answers:
- **Collects or shares required data:** yes.
- **Encrypted in transit:** yes (`https://levapp.app/api`).
- **Shared:** nothing. Google Cloud (hosting), Gmail (email) and Expo (push and updates) act as
  service providers, which is not "sharing" under Play's definitions.
- **Deletion:** in the app (Settings → Account → Delete account) and on the web at
  **https://levapp.app/delete-account** (PAD-603). The account, profile, sessions and push
  registrations are deleted. Sent messages stay as "Deleted user", the coach's class records stay,
  and backups expire on their own schedule.

| Data type (Play category) | Collected | Optional | Purpose |
|---|---|---|---|
| Name (Personal info) | yes | no | App functionality, account management |
| Email address (Personal info) | yes | no | App functionality, account management, developer communications (codes, invitations, notices) |
| User IDs (Personal info): username | yes | no | App functionality, account management |
| Phone number (Personal info) | yes | **yes** (`packages/validation`: phone optional) | App functionality, account management |
| Other info (Personal info): date of birth, country, level | yes | no | App functionality (age eligibility, categories), account management |
| Other in-app messages (Messages) | yes | yes | App functionality |
| Other user-generated content (App activity): notes, evaluations, classes, information about other people entered by coaches | yes | yes | App functionality |
| Device or other IDs: Expo push token | yes | yes (needs the notification permission) | App functionality (notifications) |
| App info and performance | **no** | | No crash or analytics SDK ships (grep of `apps/mobile/package.json` and the lockfile, 2026-10-21; re-check before each Console update). expo-updates sends IP, platform and version only to deliver updates. |
| Photos and videos | **no** | | The Android app has no photo upload (no picker, camera or `FormData`). It only displays photos uploaded on the web. **Flips to yes** (optional, user-provided, app functionality) the day the app gains an upload. |

Not collected: location, financial info, health and fitness, contacts, calendar, audio, files, web
history, advertising IDs. There is no ads SDK and no analytics SDK.

The AI spreadsheet import (OpenRouter/Inception) is web-only: mobile only lists past imports and
reverts them, so the Android form leaves it out.

## Content rating (IARC) — draft answers

No violence, sexual content, profanity, drugs, gambling or purchases. **Users can interact**
(in-app messaging between coaches and students) and users share user-generated content (messages,
notes, evaluations); report and block exist in the app. Location is not shared. Expected result: the lowest age rating, with the "Users interact"
notice.

## Target audience — owner decision

LevApp accepts **adults only**: sign-up, invitation acceptance and account activation all refuse
anyone under 18 (PAD-445, PAD-457), and the PAD-198 guardian-consent flow was removed. In Play
Console (PAD-608):
- Target age groups: **18 and over** only.
- Appeals to children: no. The Families Policy does not apply.
- **Restrict Minor Access: on.**

## Follow-ups (not in this change)

- **Android App Links verification** — serve `/.well-known/assetlinks.json` from `levapp.app` and
  `padellevelup.com` with package `com.padellevelup.app` and both SHA-256 fingerprints from the
  signing-key step (`auth.mobile-universal-links` rule 7). Added only once the real fingerprints
  exist; until then a link opens the browser and the web flow works as today.
- **`expo-system-ui`** — `expo prebuild` warns that `userInterfaceStyle: light` needs it on
  Android; without it a phone in dark mode may tint native pickers. Adding it is a native
  dependency, so it ships with the next iOS and Android builds together.
- **Parity check on a real Android device** — the same code paths as iOS 1.1.x (account deletion,
  report and block in messages, pt/en). Run the Maestro suite on an emulator and the weekly QA
  sweep on Android before the first production release.

## Android screenshots

The Play phone screenshots come from the real app on an emulator, made by the workflow
`.github/workflows/android-store-screenshots.yaml` (PAD-608 item 5). Nothing is uploaded to Play.

- **Run it:** Actions → "Android store screenshots" → Run workflow (once the file is on `main`), or
  open a pull request into `staging` that touches the workflow or `store/android/screenshots/**`;
  the PR that adds the workflow produces the artefact itself.
- **Result:** the artefact **`play-store-screenshots`** on the run (seven PNGs, `01-dashboard` to
  `07-student-dashboard`). On a failure, **`store-screenshots-debug`** holds Maestro's screenshots
  and logs and the Flask log.
- **How:** a throwaway Postgres (`levelup_store_shots`) gets the E2E seed, then
  `screenshots/fictional.sql`; Flask on :5001; a `pixel_2` emulator (1080 × 1920, ratio 1.78, inside
  Play's 2× limit; the lane's pixel_6 is 2.22) with a clean status bar (09:41, full battery);
  `screenshots/capture.yaml` logs in as the seeded coach and student and shoots dashboard, calendar
  (Semana), players, a player with evaluations, messages, an open conversation, and the student's
  dashboard.
- **Fictional-data rule:** public screenshots never show real people or the seed's "E2E" and
  "Filler" names. `fictional.sql` renames every person, the academy ("ACADEMIA NORTE"), the class
  titles and the chat text, and the flow fails if "E2E", "Filler" or "Maestro" is on screen when a
  shot is taken. Only ever run it on that throwaway database, never on a shared or production one.
- **The owner picks 2–8** of the seven (add or drop screens in `capture.yaml`; Play takes 2 to 8
  phone screenshots) and uploads them in Play Console.
