# Notifications (Phase G)

HealthPredict has **three separate mechanisms**. They are independent and must not be confused:

| | What it is | Where it lives | Needs a server push service? | Verified on a real device/browser? |
|---|---|---|---|---|
| **In-app inbox** | A persistent list of notifications with read/unread state | Backend (`notifications` table) + web page + mobile screen | No | Backend and API: yes (tests against a real DB). **Web and mobile UI: not in a real browser/phone.** |
| **Local reminders (mobile)** | Notifications the phone itself schedules and shows at set times: medicine doses (Phase D) and wellness reminders (hydration, bedtime) | On the device only (Expo Notifications, local scheduling) | No | **No.** Scheduling is tested against a mocked notification API only. |
| **Desktop alerts (web)** | A system notification shown by the open web app (browser Notification API) when a *new* inbox item arrives while the tab is hidden | The open browser tab | No | **No.** Tested with a mocked `Notification`. |

**Remote push notifications (a server sending to a phone or browser while the app is closed) are NOT implemented and NOT claimed.**
See "What remote push would need" below.

## 1. In-app inbox

### Data
Uses the existing `notifications` table unchanged (**no schema change in Phase G**). An ORM model (`models/notification.py`) now maps it.
`related_entity_type` / `related_entity_id` say what a notification is about; **clients map that to their own screens** (`action_url` is left unset
because web and mobile use different routes).

### API (`/api/notifications`, authenticated, each user sees only their own)
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?page&page_size&unread_only&type` | Newest first. `page_size` max 100. Returns `items`, `total`, `unread`, `page`, `page_size`. `type` must be a known type (else 422). |
| GET | `/notifications/unread-count` | `{unread}` |
| POST | `/notifications/refresh` | Derives any due notifications from the user's **real records** (below). Idempotent: `{created}`. Clients call this when they open. |
| POST | `/notifications/read-all` | `{updated}` |
| POST | `/notifications/{id}/read` | Sets `is_read`/`read_at`; idempotent (the first `read_at` is kept). **Another user's id returns 404, not 403**, so ids reveal nothing. |

There is **no DELETE** (see "Design decisions").

### How notifications come to exist (no invented data)
There is no background scheduler. `refresh` derives notifications from existing rows, each with a stable key
`(type, related_entity_type, related_entity_id)` so it is never created twice:

| Type | Created when | Key |
|---|---|---|
| `MISSED_MEDICINE` | An **active** medicine has doses that are past-due (before today, in the last 3 days) and neither taken nor skipped | the newest missed schedule row |
| `ASSESSMENT_COMPLETED` | An assessment was saved in the last 7 days (high-risk wording is informational: "not a diagnosis") | the assessment |
| `WEEKLY_REPORT` | A weekly report was generated in the last 14 days | the report |
| `GOAL_PROGRESS` | A goal was marked COMPLETED in the last 14 days | the goal |
| `WELLNESS_REMINDER` | No assessment in the last 7 days (or none ever, for accounts older than 3 days); at most once per ISO week | the ISO week |

`MEDICINE_REMINDER` and `ADMIN_MESSAGE` exist in the table's enum but are **not produced** (dose reminders are local to the phone; there is no admin messaging).
Because creation happens on `refresh`, a user who never opens the app gets nothing, and the server cannot wake a phone.

### Concurrency
Two clients refreshing at once (web bell + phone) could each see "does not exist yet" and both insert. `refresh` serialises per user by committing,
then locking the user row (`SELECT ... FOR UPDATE`) before reading. This is covered by a **deterministic race test** (a delay is injected between the
existence check and the insert so both refreshes are guaranteed to pass the check). It was **mutation-verified**: with the lock removed the test fails
every time (`[2, 2]` instead of `[0, 2]`). An earlier, simpler HTTP-level concurrency test passed even without the lock, so it is kept only as a smoke test.

### Design decisions
- **No `DELETE`.** The architecture sketch listed one, but with no "dismissed" column a deleted *derived* notification would simply be re-created by the next
  `refresh`. Read/unread is the supported state. A tombstone column would be a schema change, which Phase G did not need.
- **Derive on refresh, not in the original event code.** Hooking creation into the assessment/goal/report services would touch many working modules; deriving
  from the stored rows keeps the change contained and testable, and makes it impossible to notify about something that did not happen.
- **404 rather than 403** for foreign ids.

## 2. Web
- A **bell with an unread badge** in the app header (`NotificationBell`), and an inbox page at `/notifications` (list, unread filter, mark one/all read,
  pagination, "Open" link to the related page).
- `NotificationsProvider` asks the server to derive notifications when the user signs in and when the tab becomes visible again (at most every 5 minutes),
  and re-reads the unread count every minute. Failures are silent: the bell keeps its last value.
- **Desktop alerts** (opt-in, per user, remembered in `localStorage`): a system notification for a *new* item **while the tab is hidden**, only if the user
  opted in and the browser granted permission. This is **not Web Push**: no service worker, nothing is delivered when the app is closed.

## 3. Mobile
- **Inbox** (`Notifications` screen, from the Home bell with badge or Profile): same endpoints as the web.
- **Local medicine reminders** (Phase D, unchanged): built from the backend's real schedule for the next 14 days.
- **Local wellness reminders** (new, `Reminders` screen): hydration (every 1/2/3/4/6 hours between a start and end hour) and a daily bedtime reminder,
  scheduled as **repeating daily local notifications** on their own Android channel. They know nothing about progress (a water reminder still appears if the goal was
  reached) and say so in the UI. Choices are stored per user in SecureStore; invalid stored data falls back to "off".
- Only reminders created by this app are ever cancelled (by `data.kind`), so medicine and wellness reminders do not disturb each other.
- **Sign-out cancels both kinds** of local reminders so they never fire for the next person on the phone.
- Tapping a reminder opens the relevant screen (medicine, or the Track tab for hydration/bedtime).

## 4. What remote push would need (NOT done)
To deliver notifications while the app is closed, all of the following are required, and none exist in this project:
1. A **development or production build** (remote push is not available in Expo Go on Android since SDK 53) and an **EAS project ID** configured for Expo push tokens.
2. **Credentials**: Firebase Cloud Messaging (FCM v1) service account for Android and an Apple Push key (APNs) for iOS, uploaded to EAS (or your own FCM/APNs setup).
3. **Backend work**: a table/column to store each device's push token per user, an endpoint to register/unregister it, a sender (Expo Push API or FCM/APNs)
   that calls it, and a **scheduler/worker** to decide when to send (the server currently has no background jobs).
4. **Privacy decisions**: notification text appears on lock screens; messages should avoid sensitive health detail.
5. **Testing on real devices** for both platforms, including permission flows and delivery when the app is closed.
For web, the equivalent is Web Push: a service worker, VAPID keys, a subscription endpoint and a sender.

## 5. Known limitations
- Nothing about local reminders or desktop alerts has been verified on a real phone or in a real browser.
- Notifications exist only after a client has opened the app/web page since the underlying event.
- A missed-dose notification is keyed on the newest missed dose: if that exact dose is later logged, the next-newest missed dose can produce one new notification.
- The 14-day window for medicine reminders and the lack of any server scheduler mean reminders stop if the app is not opened for about two weeks.
- Wellness reminders are fixed-time and not adaptive.
