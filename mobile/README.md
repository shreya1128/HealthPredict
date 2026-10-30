# HealthPredict Mobile (Expo / React Native)

Phases B + C + D + E: navigation, design system, secure auth, API client, core health features, medication management
and local dose reminders, plus mobile wellness tracking, live goals and weekly reports with authenticated PDF sharing.
It talks to the **same FastAPI backend and database as the web app** - nothing is duplicated here. All displayed
metrics and goal progress are loaded from backend records; blank optional nutrition values are not estimated.

- **Expo SDK 57** (React Native 0.86, React 19.2, Expo Router 57, TypeScript 6)
- Auth tokens in the OS keychain/keystore via `expo-secure-store`
- Styling: plain React Native `StyleSheet` + design tokens in `src/theme` (NativeWind was dropped; see "Decisions")

## 1. Run it

```bash
# Terminal 1 - backend, listening on ALL interfaces so a phone can reach it
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - mobile
cd mobile
npm ci
cp .env.example .env        # then set the backend address (next section)
npx expo start
```

Open it with **Expo Go** (phone) or an Android emulator / iOS simulator. A store build of Expo Go only opens projects
built for the SDK it supports; this project targets SDK 57. If Expo Go reports an SDK mismatch, update Expo Go.

## 2. Where to put your backend IP

Edit **`mobile/.env`** (copy of `.env.example`; git-ignored). This is the only place:

```
EXPO_PUBLIC_API_BASE_URL=http://<your-computer-LAN-IP>:8000/api
```

| Where the app runs | Value |
|---|---|
| **Physical phone** (same Wi-Fi as your computer) | `http://192.168.x.x:8000/api` - your computer's LAN IP. Find it with `ipconfig` (Windows) / `ifconfig` or `ip addr` (macOS/Linux). |
| Android emulator | `http://10.0.2.2:8000/api` |
| iOS simulator | `http://localhost:8000/api` |

Restart `npx expo start` after editing `.env`. If your computer's firewall blocks port 8000, allow it.

### How the API URL is chosen (`src/config/apiUrl.ts`)
1. `EXPO_PUBLIC_API_BASE_URL` if set (a missing `http://` or `/api` is added for you).
2. Otherwise, **in development only**, the IP of the machine running `expo start` plus `EXPO_PUBLIC_API_PORT` (default 8000).
   This is right whenever Metro and the backend run on the same computer. Tunnel hostnames are ignored.
3. Otherwise `10.0.2.2` on Android, `localhost` on iOS.

In development the **Profile** tab shows the URL actually in use and which rule picked it.
Android release builds block plain `http://` by default, so a production build needs an `https://` backend.

## 3. Structure

```
src/app/                       Expo Router (file = route)
  index.tsx                    "/"  splash -> redirects by session state
  (auth)/                      public: onboarding, login, register, forgot-password, reset-password
  (app)/                       protected (guard in _layout.tsx)
    (tabs)/                    home (dashboard), health (hub), medicines, track (exercise/sleep/water/meals/goals), profile
    medicines/new.tsx, [id].tsx, edit/[id].tsx    add, details (schedule, adherence, pause/delete), edit
    assessment/new.tsx         record readings -> POST /health/assessment
    assessment/[id].tsx        score + breakdown, AI estimate + explanation, measurements
    history.tsx                trend charts (7/30/90 days) and list of past assessments
    health-profile.tsx         height, weight, lifestyle, gender/DOB (inputs the AI estimate needs)
    reports.tsx                weekly report, saved report history, authenticated PDF download/share
src/api/                       createClient.ts (axios + refresh logic), auth/health/profile/dashboard/medicines/tracking/reports.ts, errors.ts, types.ts
src/hooks/                     useApiQuery (focus-aware loading), useStatusBarStyle
src/auth/                      AuthContext, SecureStore token store
src/components/ui/             AppText, Button, TextField, Card, Banner, EmptyState, ListRow, ScoreGauge, TrendChart, ...
src/components/health/         AssessmentResult, PredictionCard
src/components/medicine/       MedicineForm, DoseRow, AdherenceCard, ReminderCard, ReminderBootstrap
src/notifications/             reminderPlan.ts (pure planner), medicineReminders.ts (expo-notifications)
src/theme/                     colours, spacing, typography
src/utils/trackingForm.ts      pure validation/payload builders for wellness forms
src/__tests__/                 unit + router-flow tests; live/ = opt-in tests against a running backend
```

### Authentication (uses the backend's existing contract, nothing new)
- `POST /auth/login` -> `access_token`, `refresh_token`, `expires_in` (seconds); stored in SecureStore.
- Every non-auth request gets `Authorization: Bearer <access>`.
- The client refreshes **shortly before expiry** (from `expires_in`) and, as a fallback, after a `401`, then retries once.
- Refresh is **single-flight**. The backend rotates the refresh token and treats reuse of an old one as theft
  (revokes all of the user's sessions), so two simultaneous refreshes would log the user out.
- Only a *rejected* refresh token ends the session. If the server is unreachable at launch the app shows a retry
  screen and keeps the session.
- Register returns the user without tokens, so the app then calls login with the same credentials.
- Password reset: no SMTP yet. In development the reset token is printed in the backend console; paste it on the
  reset screen, or open `healthpredict://reset-password?token=<token>`.

## 4. Checks

```bash
npm run typecheck      # tsc (run `npx expo start` once first so typed routes are generated)
npm run lint           # expo lint
npm test               # unit + router-flow tests; live API tests are opt-in
npm run export:check   # Metro-bundles Android + iOS (Hermes) into .export-check/ (delete it afterwards)
```

Live tests against a real backend (start it with `RATE_LIMIT_ENABLED=false` and `ENVIRONMENT=development`, output to a log file).
They run the app's real auth and health code, including a real ML prediction, and need a database loaded with `database/schema.sql`:

```bash
HP_LIVE=1 EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api HP_BACKEND_LOG=/path/to/backend.log npx jest src/__tests__/live
```

## 4b. Health features: how they behave
- **Two separate numbers.** The *health score* (rule-based, with a per-component breakdown) and the *AI heart-risk estimate*
  (trained model + SHAP reasons) are computed independently by the backend and shown separately. Neither is computed on the phone.
- **Missing information is shown, not guessed.** If the AI estimate lacks inputs, the result lists exactly what to add
  and links to the health profile. The estimate is calculated when an assessment is saved, so after completing the profile
  record a new assessment.
- **Each submission is a new assessment**; the trend charts keep the latest one for each day.
- Decimals arrive from the API as strings (e.g. `"72.50"`); they are converted once in `src/api/*.ts`.
- Charts are drawn with `react-native-svg` (no chart dependency). Missing days are gaps, never zeros.
- Home shows only sections that have real data; a new user sees just the "first assessment" prompt.

## 4c. Medicines and reminders: how they behave
- **Everything comes from the backend.** Doses, statuses and adherence are the server's numbers: *adherence = taken ÷ scheduled*,
  where skipped doses and today's still-pending doses count as not taken and *missed* means past-due and neither taken nor skipped.
  The app shows the counts behind each percentage. When nothing has been scheduled yet it says so instead of showing 0%.
- **Overall adherence** uses `GET /medicines/adherence/overall` (added to the backend for this phase; paused medicines are excluded).
- **Schedules follow the backend's rules:** daily = any number of times (up to 10); weekly = one dose every 7 days on the start date's
  weekday; monthly = one dose every 30 days; as-needed = no schedule. The form enforces one time for weekly/monthly.
- **Pause / resume** sets `is_active`. A paused medicine is left out of today's doses, overall adherence and reminders.
- **Editing** frequency, times or end date rebuilds *future* doses only; logged history is kept. The start date can't be changed.
- **Logging doses:** past and today's doses can be marked taken or skipped. The backend has no "undo", so a logged dose can only
  be switched between taken and skipped.
- **Reminders are local, on-device notifications** (no server push, no credentials): built from the backend's real schedule for the next
  14 days (nearest 60, because iOS keeps at most 64 pending), refreshed at launch, when the app returns to the foreground, and after any
  medicine or dose change. They are opt-in per user (Medicines tab), cancelled on sign-out, and tapping one opens that medicine.
  Android uses a "Medicine reminders" channel. Reminders work in Expo Go; **remote push does not** (not used here).
- Expo Go limits: notification behaviour in Expo Go can differ from a real build; verify on your device (see STATUS.md).

## 4d. Wellness tracking and reports (Phase E)
- **Track** uses the existing authenticated `/exercise`, `/sleep`, `/hydration`, `/nutrition`, and `/goals` endpoints. It supports create/list/delete for wellness logs, daily/weekly summaries, goal creation, status changes and deletion.
- Goal progress is read from the backend on each refresh. It is not computed from guessed or local-only health data. The `OTHER` goal type intentionally has no automatic progress source; weight progress follows the backend's documented closeness formula.
- Optional nutrition calories and optional exercise/sleep values remain blank when the user did not enter them. Sleep duration is computed by the backend when both bedtime and wake time are supplied.
- **Weekly Reports** loads the backend's current weekly report and saved history. PDF bytes are fetched through the authenticated API client, written to the app cache and passed to the native share sheet. The user can choose a destination in the share UI; cache files may be removed by the operating system.
- **Verified (in a Jest/Node environment against the real backend):** the PDF is fetched through the authenticated client, is a real PDF (`%PDF-` header, >1 KB), and the hand-written base64 encoder reproduces the exact bytes (tested against Node's encoder up to 2 MB). Failure paths are tested: share error, sharing unavailable, failed download, report not yet saved. The temporary cache copy is deleted in every case.
- **NOT verified on a device:** React Native's XHR returning an `ArrayBuffer` for `responseType: 'arraybuffer'` (Node returns a `Buffer`), `expo-file-system`'s legacy API writing the file, and the native share sheet. These need a phone.

## 4d. Notifications and reminders (three separate things)
1. **In-app inbox** (`Notifications` screen; Home bell with unread badge; Profile > Notifications). Same API as the web (`/api/notifications`).
   Opening it first asks the server to derive anything due from your real records, then lists it. Tapping an item marks it read and opens the related screen.
2. **Local medicine reminders** (Phase D, Medicines tab) and 3. **local wellness reminders** (Profile > Reminders: hydration every 1/2/3/4/6 hours between two hours, and a daily
   bedtime reminder). Both are scheduled **on the phone**; wellness reminders repeat daily at fixed times and **do not know your progress** (a water reminder still
   appears if you reached your goal). Only reminders this app created are ever cancelled; **sign-out cancels both kinds**.
- **Remote push is not set up.** Nothing is sent by a server while the app is closed. `docs/notifications.md` lists exactly what that would need
  (EAS project ID, FCM/APNs credentials, a device-token table and endpoint, a sender and a scheduler, and real-device testing).
- **Not verified on a device:** permission prompts, Android channels, delivery at the scheduled time, and tap-to-open from a real notification. The scheduling module is
  tested against a mocked notification API only.

## 5. Decisions and known limitations
- **SDK 50 -> 57.** The project's `package.json` could not install (SDK 50 / router mismatch) and Expo Go from the app stores only supports recent SDKs, so SDK 50 projects are unlikely to open in it.
- **No NativeWind.** v2 (in the old `package.json`) is incompatible with current React Native; v4+ needs Babel, Metro and
  Reanimated config that could not be visually verified here. Theme tokens + `StyleSheet` keep styling simple and checkable.
- `react-native-reanimated`, `-worklets`, `-gesture-handler` and `react-dom` are installed only because Expo Router
  requires them; versions are pinned to the SDK on purpose (floating versions break the Expo Go native build).
- **Backend schedule extension:** Schedules generate an initial 90-day horizon upon creation and are dynamically auto-extended forward via `ensure_schedule_ahead` whenever doses are queried, so long-running treatments continue rolling forward smoothly. As-needed medicines log ad-hoc doses; schedule reminders assume the phone's wall-clock time zone matches yours.
- **Local reminder rolling window:** The 14-day rolling window is topped up on app launch, return from background, and dose logging. If the device remains completely closed past 14 days without opening the app, local notifications expire until the user next launches the app (as remote server push is not configured).
- **Track tab design limit:** it loads nine endpoints together, so if any one of them fails the whole tab shows the error screen (retry works). Per-section loading would be more resilient.
- The `expo-sharing` and `expo-file-system` packages are pinned to the SDK 57 versions; PDF sharing needs a real device to confirm.
- Not tested on a device or emulator. See STATUS.md "Mobile" for exactly what was and was not verified. Local medicine reminders and PDF sharing still require real-device verification.
