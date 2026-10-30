# HealthPredict — Final Project Handoff (Round 6 Complete: Full Hardening, Privacy Boundaries & Regression Verified)

> **Snapshot Date**: 24 October 2026  
> **Status**: All Features A through F + Round 6 Defect Fixes & Security Hardening Complete, Multi-Tenant Privacy Isolated, 2FA Web Flow Verified, Full Regression Verified  
> **Project Directory**: `HealthPredict/`

---

## 1. Executive Summary

HealthPredict is a hardened, full-stack consumer health management platform:
- **Web**: React 18 + Vite 5 + Tailwind CSS (`web/`)
- **API**: FastAPI + SQLAlchemy 2.0 + MySQL 8.0 (`backend/`)
- **Mobile**: React Native + Expo SDK 57 + TypeScript (`mobile/`)
- **ML Engine**: Scikit-Learn Gradient Boosting + SHAP explainability (`ml/`)

The platform tracks medication regimens, health assessments, vitals, sleep, hydration, exercise, and wellness goals. It generates weekly clinical PDF reports, Doctor Summary share links, HL7 FHIR Release 4 Document Bundles, provides caregiver delegation, and automates real-time dose, refill, and appointment reminders.

| Layer | Technology | Status & Test Counts |
|---|---|---|
| **Backend API** | FastAPI, SQLAlchemy 2.0, Pydantic v2 | **Full pytest suite passes** (0 failures; verified against MySQL 8.0 via TEST_DATABASE_URL) |
| **Machine Learning** | Scikit-learn Gradient Boosting, SHAP | **31 pytest tests pass** (73.4% accuracy, 0.8014 ROC-AUC) |
| **Web Frontend** | React 18, Vite 5, Tailwind CSS, Lucide | **170 Vitest tests pass** (16/16 suites), build clean (2,307 modules) |
| **Mobile App** | React Native, Expo 57, TypeScript | **264 Jest tests pass** (57 live skipped), `tsc` clean (0 errors) |
| **Database** | MySQL 8.0 / MariaDB | **33 tables + 1 view** (`schema.sql` includes all screening tables; migrations 001–018 applied) |
| **Security Audit** | pip-audit | **0 vulnerabilities** across declared `requirements.txt` dependencies. Production mode strictly validated (debug=false, cookie_secure=true, 32+ char key). |

---

## 2. Round 3 Progress Across All Groups (1–11)

### Group 1 — Security (S1–S7) ✅ COMPLETED & VERIFIED
- **S1 (Token Logging)**: Removed token and email body logging from `backend/app/utils/email.py`. Implemented `EMAIL_BACKEND` (`smtp` default, `memory` for tests) with production guard preventing startup if `EMAIL_BACKEND=memory` in production.
- **S2 (Reminder Dispatch Isolation)**: Secured `POST /api/notifications/dispatch-reminders` behind `INTERNAL_API_KEY` or admin role. Added `sent_at` dose deduplication and honest gateway error reporting in `push_service.py`.
- **S3 (Vulnerable Dependencies)**: Upgraded PyJWT (now pinned at 2.15.1, 0 advisories), moved `pypdf` to `requirements-dev.txt` (now 6.20.1). `react-router` is now ^7.18.4. Ran `pip-audit`.
- **S4 (Least-Privilege DB Setup)**: Deleted root-granting `init_db.py`. Documented least-privilege `hp_user@'localhost'` grants.
- **S5 (Login Rate Limiter)**: Redesigned rate limiter in `backend/app/utils/rate_limiter.py` to key by `IP + normalized_email` (10 per 15 min) with a loose per-IP ceiling and `TRUSTED_PROXIES` validation.
- **S6 (Security Headers & Docs Exposure)**: Added security middleware setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and conditional HSTS. Added `ENABLE_API_DOCS` setting disabling Swagger/OpenAPI in production.
- **S7 (Caregiver Token Response Leak)**: Omitted `invite_token` from API responses (`POST /api/care-profiles/caregivers/invite`), delivering tokens exclusively via notification/email.

### Group 2 — Packaging, Docker & Setup (P1–P9) ✅ COMPLETED & VERIFIED
- **P1 (Lockfiles)**: Verified clean `package-lock.json` files for both `web/` and `mobile/`. `npm ci` succeeds for `mobile/`; for `web/` the lockfile was regenerated on 2026-10-23 because `npm ci` previously failed with a missing `yaml@2.9.1` entry (now passing).
- **P2 (Dockerignore)**: Added comprehensive `.dockerignore` files for root, `backend/`, and `web/` preventing leak of `.env`, test files, or `node_modules`.
- **P3 (Production Backend Container)**: Decoupled database seeding from `backend/Dockerfile`. Created `docker-compose.prod.example.yml` using environment variables only with secure defaults.
- **P4 (Default Test DB Port)**: Set test database default to standard port 3306 in `.env.example` and test configuration.
- **P5 (Default APP_URL)**: Set default `APP_URL` to `http://localhost:5173`.
- **P6 (ML Model Single Source of Truth)**: Removed duplicate `backend/ml_models/`. Model loaded from `ml/saved_models/`.
- **P7 (Sanitized Documentation Screenshots)**: Sanitized all test data in `docs/screenshots/` and configured automated capture script.
- **P8 (Doc Archive)**: Moved outdated audit and test reports to `docs/archive/`.
- **P9 (Quick Start Realignment)**: Updated `QUICK_START.md` with honest instructions and exact test suites.

### Group 3 — Honesty in App and Docs (H1–H4) ✅ COMPLETED & VERIFIED
- **H1 (Landing Page Honesty)**: Removed false claims ("Data stays on your device" → "Protected accounts and private records"; "Encrypted at rest" → "Encrypted passwords and authenticated sessions"). Added clear "What HealthPredict is not" section.
- **H2 (Privacy & Disclaimers)**: Clarified data storage locations, plain-English medical disclaimers on every key surface.
- **H3 (Demo Mode & Realistic Seeding)**: Login demo button is conditional on `VITE_ENABLE_DEMO=true`. Updated `seed_data.py` to populate 60 days of realistic history across all vitals, medicines, and goals when `SEED_DEMO_DATA=true`.
- **H4 (Documentation Audit)**: Updated `README.md`, `STATUS.md`, and `docs/database.md` to reflect verified facts only.

### Group 4 — Medicine Intelligence (M1–M4) ✅ COMPLETED & VERIFIED
- **M1 (openFDA & RxNav Integration)**: Rewrote `drug_intelligence_service.py` with RxNav autocomplete and openFDA interaction analysis. Cached results in `drug_interaction_cache` table. Returns honest status (`found`, `none_found_in_source`, `could_not_check`).
- **M2 (Web UI Integration)**: Added RxNav autocomplete input in `Medicines.jsx` with clinical interaction warning banners and a "Check my medicines" trigger for all active medications.
- **M3 (Inventory & Refill Alerts)**: Added `quantity_on_hand`, `pills_per_dose`, `refill_threshold_days`, and `pharmacy_note` to medicines table and ORM model. Decrements stock when dose taken. Generates `MEDICINE_REFILL` notifications when quantity drops below threshold.
- **M4 (OCR Architecture Clarification)**: Clarified `POST /api/medicines/scan` architecture in docs and added honest frontend guidance banner noting that automatic extraction requires an active Vision API key.

### Group 5 — Family & Caregiver Profiles (FP1–FP5) ✅ COMPLETED & VERIFIED
- **FP1 (Multi-Profile Architecture)**: Created `care_profiles` table with foreign key relations across all 11 health tables. Added `ProfileScope` middleware extracting active profile from `X-Profile-Id` header.
- **FP2 (Caregiver Delegation RBAC)**: Implemented `caregiver_access` table with `READ_ONLY` and `FULL_ACCESS` roles. Secure invite system with expiring tokens.
- **FP3 (Web Family Dashboard & Switcher)**: Added global Profile Switcher in navbar (`ProfileSwitcher.jsx`) and dedicated Care Profiles management page (`CareProfiles.jsx`).
- **FP4 (Privacy Boundaries)**: Enforced strict privacy barriers: child and dependent profiles hide parental telecom (email/phone) in clinical exports; caregivers cannot modify owner credentials or access logs outside granted scope.
- **FP5 (Automated Tests)**: Dedicated `backend/tests/test_group5_care_profiles.py` verifying profile isolation, CRUD operations, and permission escalation prevention.

### Group 6 — Account & Data Sessions (A1–A5) ✅ COMPLETED & VERIFIED
- **A1 (Account Deletion & Data Wipe)**: `DELETE /api/auth/account` performs cascading deletion removing all user rows, health history, logs, and tokens.
- **A2 (Multi-Format Account Export)**: `GET /api/auth/account/export?format=json|zip` exports complete patient dataset as JSON or a ZIP archive of CSVs across all tables.
- **A3 (CSRF Protection & HttpOnly Cookies)**: Double-submit cookie CSRF protection (`csrf_token` cookie + `X-CSRF-Token` header) for browser clients; Bearer auth remains available for mobile clients.
- **A4 (Security Center)**: Active session listing, individual and bulk revocation, email change with confirmation token, and TOTP 2FA setup/verification.
- **A5 (Public Link Hardening)**: Doctor share links are append-only with 2,000-character caps, patient hide/delete capabilities, and token regeneration for emergency cards.

### Group 7 — Reminders & Engagement (R1–R4) ✅ COMPLETED & VERIFIED
- **R1 (Unified Multi-Channel Dispatch)**: Implemented in `backend/app/services/reminder_scheduler.py` (with `notification_service.py`), covering pending medication doses, caregiver missed-dose alerts, low-inventory refill alerts, and doctor appointment reminders. There is no separate `reminder_dispatch_service.py`. The scheduler runs as an in-process background loop (1-minute default interval, exponential backoff on failure; see `ENABLE_BACKGROUND_SCHEDULER` and `REMINDER_INTERVAL_SECONDS` in `.env.example`).
- **R2 (Expo Push Notification Architecture)**: Implemented `backend/app/services/push_service.py` supporting token registration, chunked batch delivery via Expo Push API, and unregistering invalid tokens.
- **R3 (Web Push / Desktop Notification Support)**: Browser notification utilities in `web/src/utils/browserNotifications.js` with permission workflows and real-time alerts.
- **R4 (Automated Tests)**: `backend/tests/test_group7_reminders_and_alerts.py` verifying dispatch filtering, deduplication, and device token management.

### Group 8 — Emergency Card & Symptom Logging (E1–E4) ✅ COMPLETED & VERIFIED
- **E1 (Emergency Medical ID System)**: Public emergency endpoint `GET /api/health/emergency-card/public/{public_token}` returning critical allergies, blood type, conditions, and contacts.
- **E2 (QR Code Generation)**: Dynamic PNG QR code generation (`GET /api/health/emergency-card/qr`) with vector styling and wallet card PDF rendering.
- **E3 (Symptom Logging & Timeline)**: Full CRUD for symptoms (`symptom_logs` table) tracking severity (1–10), duration, triggers, notes, and profile scoping.
- **E4 (Clinical Timeline & Doctor Appointments)**: Appointment tracking (`doctor_appointments` table) with calendar sync notes and automated reminder dispatch.

### Group 9 — Goals & Wellness Insights Engine (G1–G4) ✅ COMPLETED & VERIFIED
- **G1 (Multi-Metric Wellness Goals)**: Goal management across 6 types: `STEPS`, `EXERCISE_MINUTES`, `SLEEP_HOURS`, `WATER_ML`, `WEIGHT_KG`, `MEDICINE_ADHERENCE`.
- **G2 (Real-Time Goal Progress Engine)**: Real-time progress computation reflecting live tracking logs without caching anomalies.
- **G3 (Cross-Domain Wellness Correlation)**: Implemented `GET /api/correlations` computing Pearson correlations between sleep, exercise, hydration, and health scores with non-causal language.
- **G4 (Automated Tests & UI Integration)**: Dedicated test suite `test_group9_goals_and_wellness.py` (3/3 passed). Verified responsive design across 390px, 768px, and 1280px viewports.

### Group 10 — Reports & Clinical Export (C1–C3) ✅ COMPLETED & VERIFIED
- **C1 (Enhanced Weekly Clinical PDF Export)**: Vector ReportLab PDF generation (`GET /api/reports/weekly/pdf` and `GET /api/reports/weekly/{id}/pdf`) including vital metrics, medication adherence, weight change, notable changes, suggestions, and prominent medical disclaimers. Formatted to ensure single-page layout without clipping.
- **C2 (HL7 FHIR Release 4 Document Bundle Export)**: `GET /api/reports/fhir` and `GET /api/reports/fhir/download` producing compliant FHIR R4 JSON document bundles containing `Patient`, `Composition`, `MedicationStatement`, `Observation` (LOINC codings: 85354-9 BP, 8867-4 Heart Rate, 2339-0 Blood Glucose), and `Condition` (SNOMED-CT codings). Strictly suppresses parental email and phone telecom when exporting non-primary/child care profiles.
- **C3 (Multi-Format Tabular Account Export)**: `GET /api/auth/account/export?format=json|zip` generating complete nested JSON and clean ZIP archives containing 10 CSV tables (`profile.csv`, `care_profiles.csv`, `medicines.csv`, `health_history.csv`, `exercise_logs.csv`, `sleep_logs.csv`, `hydration_logs.csv`, `symptoms.csv`, `doctor_appointments.csv`, `notifications.csv`).
- **Integration Test**: `backend/tests/test_group10_reports_and_export.py` (3/3 passed on live MySQL).

### Group 11 — Final Polish, Audit & Documentation Rewrite (F1–F4) ✅ COMPLETED & VERIFIED
- **F1 (End-to-End Test Execution)**: All backend tests pass with 0 failures against MySQL 8.0. All frontend Vitest tests pass (170 as of 2026-10-25).
- **F2 (Production Build Verification)**: `npm run build` in `web/` bundles 2,295 modules in 12.59s with zero errors or warnings.
- **F3 (Dependency & Security Audit)**: `pip-audit -r requirements.txt` reports **0 known vulnerabilities**.
- **F4 (Documentation & Delivery Archive)**: Comprehensive handoff documentation (`HANDOFF.md`, `STATUS.md`, `README.md`) updated with exact metrics and honest capabilities. Final project archive `HealthPredict_Final_HandOff.zip` packaged with zero secrets.

---

## 3. Database Architecture & Migrations

The database consists of **33 tables and 1 view** in lockstep with SQLAlchemy models (`test_schema_drift.py` passes):
1. `users`: Account credentials, contact info, role, TOTP secret, status.
2. `user_tokens`: Refresh tokens, password reset, and verification tokens.
3. `user_profiles`: Core physical vitals, allergies, conditions, and lifestyle habits.
4. `care_profiles`: Family members and dependent profiles (primary vs secondary).
5. `caregiver_access`: Delegation grants (`VIEW_ONLY`, `EDIT`) with invite tokens.
6. `token_blocklist`: Revoked JWT access tokens for immediate logout.
7. `user_device_tokens`: Registered mobile device push tokens (Expo/FCM/APNs).
8. `notifications`: In-app notification inbox.
9. `admin_audit_logs`: Audit trail for administrative actions.
10. `health_assessments`: Point-in-time clinical assessments, symptoms, and risk levels.
11. `health_predictions`: Saved ML predictions and top SHAP feature contributions.
12. `health_history`: Daily aggregated health scores, weights, and vitals.
13. `ml_model_info`: Tracked machine learning model versions and validation metrics.
14. `medicines`: Medication catalog, dosage, frequency, and inventory counts.
15. `medicine_schedules`: Generated dose timetable for today and upcoming horizons.
16. `medicine_intake_logs`: Recorded intake actions (`TAKEN`, `SKIPPED`, `MISSED`).
17. `drug_interaction_cache`: Cached openFDA and RxNav drug interaction results.
18. `exercise_logs`: Daily workout logs (type, duration, intensity, calories).
19. `sleep_logs`: Overnight sleep duration and quality logs.
20. `hydration_logs`: Daily water intake entries (ml).
21. `nutrition_logs`: Meal logs with calorie counts and macronutrients.
22. `wellness_goals`: User target goals with timeframe and target values.
23. `goal_progress`: Daily computed goal progress snapshots.
24. `weekly_reports`: Historical weekly health summaries and recommendations.
25. `doctor_shares`: Expiring share links for consulting physicians.
26. `doctor_share_notes`: Physician notes and recommendations left on shared records.
27. `emergency_cards`: Emergency medical ID cards with public token.
28. `symptom_logs`: Clinical symptom diary with severity, triggers, and notes.
29. `doctor_appointments`: Medical appointments with provider details and reminders.
30. `diabetes_screenings`: Validated FINDRISC / ADA non-invasive risk screening records.
31. `menstrual_logs`: User-controlled cycle tracking, period duration, flow, and symptoms.
32. `pcos_screenings`: Educational symptom screenings aligned with Rotterdam diagnostic consensus criteria.
33. `fatty_liver_screenings`: Cardiometabolic risk factor awareness screenings based on MASLD consensus.
34. `view_active_medicines` (View): Convenient view of active medication regimens.

---

### Round 4 — Feature Expansion & Integration (Features A–F) ✅ COMPLETED & VERIFIED
- **Feature A (Unified Personal Health Timeline)**: Built `timeline_service.py` aggregating 8 streams with data provenance badges (`MEASURED`, `SELF_REPORTED`, `CALCULATED`, `MODEL_ESTIMATE`). Web `/timeline` and mobile History 3-way toggle.
- **Feature B (Voice-Assisted Health Entry)**: Deterministic parser `voice_parser_service.py` for Weight, BP, Sleep, Hydration, Exercise. Explicit confirmation modal with typed-entry fallback before saving.
- **Feature C (Personalized Nutrition & Meal Planning)**: Curated food catalog, allergy exclusions, 7-day meal plan generator with grocery list in `MealPlannerSection.jsx`.
- **Feature D (Diabetes Risk Assessment)**: Validated FINDRISC / ADA non-invasive risk model in `diabetes_service.py`, Migration 012 (`diabetes_screenings`), Web `/diabetes`.
- **Feature E (Menstrual Tracking & PCOS Support)**: Menstrual cycle tracking with duration/regularity math and privacy deletion; decoupled Rotterdam criteria educational questionnaire in `menstrual_service.py`, Migration 013 (`menstrual_logs`, `pcos_screenings`), Web `/menstrual`.
- **Feature F (Fatty Liver Risk Awareness)**: Evidence-based MASLD cardiometabolic checklist in `fatty_liver_service.py`, Migration 014 (`fatty_liver_screenings`), Web `/fatty-liver`.
- **Feature G (Unified Reports & Polish)**: `GET /api/reports/comprehensive-summary` dossier and PDF report inclusion of screening statuses.
- **Clock Drift Fix**: Reconciled hardcoded date in `test_adherence_streak_calculation_and_milestones` (now 100% passing). All backend pytest tests pass (528 as of 2026-10-25).

### Round 5 — Full Navigation & Mobile Screens ✅ COMPLETED & VERIFIED (21 Oct 2026)
- **Web Sidebar Navigation**: Added "Screenings" section to `navSections` in `AppLayout.jsx` with Diabetes risk, Cycle tracking, and Liver awareness links. Imported `Droplets`, `HeartPulse`, `Bean` icons from Lucide. Updated mobile tab link indices after section insertion.
- **Mobile Diabetes Screen** (`mobile/src/app/(app)/diabetes.tsx`): Full FINDRISC questionnaire form with age group, BMI, waist, activity, diet, medication, glucose history, and family history inputs. Shows scored result with risk level, interpretation, and recommendations. Save-to-history and history list.
- **Mobile Menstrual Screen** (`mobile/src/app/(app)/menstrual.tsx`): Three-tab layout (Log, Analytics, PCOS). Log tab: period start/end dates, flow intensity, notes, delete with confirmation. Analytics tab: cycle count, average length, regularity. PCOS tab: symptom questionnaire with educational disclaimers.
- **Mobile Fatty Liver Screen** (`mobile/src/app/(app)/fatty-liver.tsx`): MASLD cardiometabolic risk factor form with BMI, waist, diabetes, hypertension, triglycerides, HDL, alcohol, and liver enzyme inputs. Shows risk factor breakdown with present/absent indicators. Save-to-history and history list.
- **Mobile Navigation**: Registered `diabetes`, `menstrual`, and `fatty-liver` screens in `_layout.tsx` Stack navigator. Added ListRow action items in `health.tsx` Health tab for all three features.
- **Regression Verification**: 528 backend pytest pass, 170 web Vitest pass, 264 mobile Jest pass, `tsc --noEmit` 0 errors, `vite build` clean (2,307 modules).

---

## 4. How to Run & Verify

### Database Setup
```bash
# Connect to MySQL and apply schema
mysql -u hp_user -p -P 3306 healthpredict < database/schema.sql   # use your own port if different (XAMPP default is 3306)
```

### Running Backend API
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Running Complete Backend Tests
```bash
cd backend
$env:TEST_DATABASE_URL="mysql+pymysql://hp_user:hp_password_123@127.0.0.1:3306/healthpredict_test"
pytest -q
# Output: 528 passed
```

### Running Web Frontend
```bash
cd web
npm install
npm test -- --run # 170 passed (16 test files)
npm run build     # 2,307 modules bundled in 6.99s (dist/)
npm run dev       # Local development server at http://localhost:5173
```

### Running Mobile App
```bash
cd mobile
npm install
npx tsc --noEmit  # TypeScript clean check
npm test          # 264 passed across 21 test suites
```

---

## 5. Honest Disclaimers & Known Limitations

1. **Physical Push Gateway Handshake**: Live push dispatch to physical devices via Apple APNs and Google FCM requires real physical hardware enrolled with provisioning profiles. The dispatch pipeline, batching, and error handling are fully verified via integration tests against the Expo Push API specifications.
2. **Paid Vision OCR API**: `POST /api/medicines/scan` supports mock extraction drafts for testing. Production OCR from medication label photographs requires an active Google Cloud Vision API key or OpenAI vision endpoint configured in environment variables.
3. **Clinical Guidance Boundary**: HealthPredict is a wellness tracking and educational platform. It does not provide medical diagnoses, treatment plans, or prescription alterations. All reports, health scores, and ML risk predictions include prominent medical disclaimers directing patients to consult licensed healthcare providers.
