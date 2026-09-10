# LevApp on Google Play — release prep (PAD-216)

Status: **prepared, not published.** Owner decision 2026-09-09: prepare only. Nothing here uploads,
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
| Feature graphic | 1024 × 500 JPEG or 24-bit PNG, no transparency | **to make** — brand navy `#0d1a30`, the lockup, one line of copy |
| Phone screenshots | 2–8, JPEG or 24-bit PNG, each side 320–3840 px, long side at most 2× the short side | **to make** — the iOS set in `../../appstore-screenshots/` is 1320 × 2868 (ratio 2.17), which Play rejects; shoot Android screenshots from an emulator (1080 × 1920 is safe) |
| Tablet screenshots | only if tablets are targeted | not needed for v1 |
| Adaptive icon | foreground on a background colour | `assets/adaptive-icon.png` on `#ffffff` (configured) |

Marketing screenshots must use fictional names (repaint real players' names, keep the initials).

## Data safety form — draft answers

Collected, **not shared** with third parties (hosting, email and push providers act as processors).
All data is **encrypted in transit** (HTTPS). Users can **delete their account in the app**
(Settings → Delete account), and a guardian can withdraw consent for a minor (PAD-198).

| Data type (Play category) | Collected | Optional | Purpose |
|---|---|---|---|
| Name (Personal info) | yes | no | App functionality, account management |
| Email address (Personal info) | yes | no | Account management, communications (codes, recovery) |
| User IDs (Personal info) — username | yes | no | App functionality, account management |
| Phone number (Personal info) | yes | yes | App functionality (coach contact) |
| Date of birth, country (Personal info → Other) | yes, once PAD-198 ships | no | Legal compliance (parental consent) |
| Other in-app messages (Messages) | yes | yes | App functionality |
| Photos (Photos and videos) — avatar and chat images | yes | yes | App functionality |
| Other user-generated content (App activity) — classes, attendance, evaluations | yes | no | App functionality |
| Device or other IDs — push token | yes, once push is enabled | yes | App functionality (notifications) |

Not collected: location, financial info, health and fitness, contacts, calendar, audio, files, web
history, advertising IDs. No ads SDK, no analytics SDK.

## Content rating (IARC) — draft answers

No violence, sexual content, profanity, drugs, gambling or purchases. **Users can interact**
(in-app messaging between coaches and students) and users can share user-generated content (chat
images). Location is not shared. Expected result: the lowest age rating, with the "Users interact"
notice.

## Target audience — owner decision

LevApp's players include minors, and PAD-198 lets under-13s sign up with a guardian's consent.
Declaring the **under-13** age group in Play Console brings the app into Google's **Families Policy**
(stricter review, privacy disclosures, SDK restrictions; LevApp has no ads or analytics SDKs, which
helps). Declaring **13+ only** is simpler but must then be true — the Android sign-up would have to
refuse under-13s. Recommendation: land PAD-198 first, then declare the age groups that match the
consent rule the owner keeps. This answers the ticket's open question: PAD-198 does not block
internal testing, but it should land before a production release.

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
