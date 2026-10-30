# HealthPredict - Quick Start

Every command below was run and verified during Phase 2 (on Ubuntu, Python 3.12, Node 20+, MariaDB 10.11).
Your target is MySQL 8.0; the schema uses only features common to both, but see "Known gaps" in STATUS.md.

## 1. Database
```bash
mysql -u root -p <<'SQL'
CREATE DATABASE healthpredict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hp_user'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL ON healthpredict.* TO 'hp_user'@'localhost';
SQL
mysql -u hp_user -p healthpredict < database/schema.sql      # creates 33 tables + 1 view
```
`schema.sql` is the source of truth for the database. The app never creates tables itself.

## 2. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then edit: DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD, DEMO_PASSWORD
python seed_data.py         # creates admin@healthpredict.local and demo@healthpredict.local
python -m uvicorn app.main:app --reload --port 8000     # add `--host 0.0.0.0` when using the mobile app on a phone
```
Check it: http://localhost:8000/health and interactive docs at http://localhost:8000/api/docs

## 3. Backend tests
Pure unit tests (146 tests) and ML prediction service tests (46 tests) run in-memory without a database:
```bash
python -m pytest backend/tests/test_health_score.py backend/tests/test_goal_progress.py backend/tests/test_schedule_generator.py backend/tests/test_sleep_duration.py backend/tests/test_wellness_insights.py backend/tests/test_prediction_service.py
```
ML model training and preprocessing tests (31 tests):
```bash
python -m pytest ml/
```
The full 528 backend integration tests require a dedicated `*_test` MySQL/MariaDB database (tests wipe user tables):
```bash
mysql -u root -p -e "CREATE DATABASE healthpredict_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON healthpredict_test.* TO 'hp_user'@'localhost';"
mysql -u hp_user -p healthpredict_test < database/schema.sql
export TEST_DATABASE_URL='mysql+pymysql://hp_user:hp_password_123@localhost:3306/healthpredict_test'
python -m pytest backend/tests/ -q
```

## 4. Web Application
```bash
cd web
npm install
cp .env.example .env.local
npm run dev        # http://localhost:5173  (proxies /api to localhost:8000)
npm test           # 170 vitest tests across 16 test files
npm run lint       # ESLint 8 verification (0 errors, 0 warnings)
npm run build      # Vite production build (0 errors)
```
The web root `/` serves a full, modern HealthPredict landing page with hero showcase, trust statistics, feature cards, 3-step workflow, technology stack, and prominent healthcare disclaimer.
Authenticated users access the full navigation: **Dashboard**, **New Assessment**, **Medicines**, **Track** (exercise, sleep, hydration, nutrition), **Goals**, **History**, **Reports** (PDF export), **Notifications**, and **Profile** (plus **Admin** for administrator accounts).

## 5. Mobile Application
Expo SDK 57 app with complete feature set: authentication, session persistence, health assessment, 0-100 health score + ML cardiovascular risk with SHAP factors, trend history, medication management with adherence and on-device dose reminders, wellness tracking (exercise, sleep, hydration, nutrition), goals, weekly reports with PDF sharing, and in-app notifications.
```bash
cd mobile
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8000/api
npm test -- --runInBand  # 264 Jest tests across 19 suites
npm run typecheck        # TypeScript check (0 errors)
npm run lint             # Expo lint check (0 warnings)
npx expo start           # backend must run with --host 0.0.0.0 for a physical phone
```
Full instructions, including emulator addresses: `mobile/README.md`. Note: Testing on physical mobile hardware or emulator was not performed in this headless environment.

## Password reset / email verification in development
No SMTP is configured yet. In non-production environments the backend logs the reset and
verification tokens to its console; open `/reset-password?token=<token>` in the web app to use one.

## 6. Admin dashboard (web)
Sign in on the web app as `admin@healthpredict.local` (password = `ADMIN_PASSWORD` from `backend/.env`, created by `python seed_data.py`).
An **Admin** link appears in the top navigation for administrators only (members never see it and are redirected away from `/admin`).
- **Overview**: account and assessment counts, activity trends, risk distribution, feature usage, platform medication adherence.
- **Users**: search and filter, activate/deactivate accounts (with an optional reason).
- **AI model**: the trained model's real test metrics, confusion matrix and candidate comparison.
- **Audit log**: every admin action, including blocked attempts.
All figures are aggregates; individual health data is never shown. See `docs/api.md` ("Admin") for the endpoints.

## 7. Notifications
- **Inbox**: a bell with an unread badge in the web header (page: `/notifications`) and the bell on the mobile Home screen. Notifications are created from your own records when you open the app (missed doses, finished assessments, weekly reports, completed goals, a weekly check-in nudge).
- **Mobile reminders**: Profile > Reminders (hydration, bedtime) and the Medicines tab (dose reminders). These are scheduled on the phone, and need notification permission.
- **Remote push is not set up.** See `docs/notifications.md` for exactly what it would require.

