> [!WARNING]
> **ARCHIVE NOTICE**: This document represents a historical handoff state from Phase J (October 2026). It contains outdated claims and paths. Refer to root `HANDOFF.md` and `STATUS.md` for current verified state.

# HealthPredict — Final Project Handoff Document (Archived)

**Project:** HealthPredict — AI-Powered Healthcare Prediction, Wellness Tracking & Medication Management System  
**Academic Target:** 100-Mark MCA Final-Year Academic Capstone Project  
**Author / Engineering Lead:** Lead Software Architect, Full-Stack Developer, UI/UX Designer & ML Engineer  
**Status:** Archived historical record (Phases A through J)  
**Date of Delivery:** October 14, 2026  

---

## 1. Deliverable Archives & Locations (Historical)

The project has been cleaned (excluding heavy `node_modules`, bytecode `__pycache__`, build artifacts, and test caches) while preserving all application source code, real trained models, cleaned datasets, test suites, and documentation.
Historical archive snapshots were generated in user download directories. Current active source code is located in the repository root.

---

## 2. Executive Summary & Accomplishments

HealthPredict is a full-stack healthcare platform engineered to meet and exceed all criteria for a **100-mark MCA final-year project evaluation**. It avoids small CRUD patterns and mock data, providing genuine end-to-end integration:

$$\text{Patient Vitals / Lifestyle} \longrightarrow \text{React Web / Expo Mobile} \longrightarrow \text{FastAPI REST Engine} \longrightarrow \text{MySQL 8.0} \longrightarrow \text{Gradient Boosting (SHAP)} \longrightarrow \text{Explainable Diagnostics \& Action Plan}$$

### Key Milestones Achieved:
- **Phase A–E**: Foundation architecture, database schema, JWT auth, rule-based 0–100 health scoring, real ML training pipeline, medication scheduling with adherence calculation, and mobile wellness tracking with clinical ReportLab PDF report generation.
- **Phase F**: Role-based Admin Dashboard on web and backend with live system metrics, model health monitoring, user status toggle, and audit logging.
- **Phase G**: Real-time in-app notification inbox on web and mobile with idempotent record-derived generation and on-device wellness & medicine reminders.
- **Phase H**: Production Web Landing Page replacing the previous `/login` redirect, full ESLint configuration (0 errors, 0 warnings), React hook optimizations, Reports week-switcher and direct PDF download, and expansion to 144 passing web tests.
- **Phase I**: Comprehensive security audit (timing-attack mitigation, tenant isolation, sliding-window rate limiting, parameter binding, token hashing at rest) and cross-platform verification (631 automated tests passing).
- **Phase J**: Complete academic documentation ([`docs/database.md`](file:///C:/Users/shrey/.gemini/antigravity/scratch/HealthPredict/docs/database.md), [`docs/security.md`](file:///C:/Users/shrey/.gemini/antigravity/scratch/HealthPredict/docs/security.md), [`README.md`](file:///C:/Users/shrey/.gemini/antigravity/scratch/HealthPredict/README.md), [`QUICK_START.md`](file:///C:/Users/shrey/.gemini/antigravity/scratch/HealthPredict/QUICK_START.md), [`STATUS.md`](file:///C:/Users/shrey/.gemini/antigravity/scratch/HealthPredict/STATUS.md)) and clean archive distribution.

---

## 3. Technology Stack & Architecture

| Layer | Technologies Used | Key Implementation Details |
|---|---|---|
| **Web Frontend** | React 18, Vite, React Router 6, Tailwind CSS, Lucide React, Recharts, TanStack Query | Modern healthcare SaaS design system, responsive landing page, interactive charts, desktop alerts, admin suite. |
| **Mobile App** | React Native, Expo SDK 57, Expo Router, NativeWind tokens, StyleSheet, Expo Notifications | Cross-platform (iOS/Android), offline storage, local schedule planner, Hermes bytecode bundle exports. |
| **Backend API** | Python 3.12, FastAPI, SQLAlchemy 2.0 ORM, Pydantic v2, PyJWT, Bcrypt, Uvicorn | Strict typing, dependency injection, centralized exception handling, sliding-window rate limiting. |
| **Database** | MySQL 8.0+ / MariaDB 10.11+ | 19 normalized tables, 1 view, stored generated BMI column, cascade deletes, SHA-256 token hashing at rest. |
| **Machine Learning**| Scikit-learn Gradient Boosting, SHAP, Pandas, NumPy, Joblib | Trained on 68,569 cleaned rows of `cardio_train.csv` (73.4% acc, 0.801 ROC-AUC); SHAP tree explainability. |
| **Reporting** | ReportLab 4.4, PyPDF | Generates clinical weekly/monthly patient PDF summaries with health scores, adherence metrics, and disclaimers. |

---

## 4. Multi-Tier Verification Evidence

A total of **631 automated tests** were executed and verified across all subsystems in this session:

```
====================================================================================================
TEST SUITE SUMMARY & EVIDENCE
====================================================================================================
1. Web Application:
   - Command: npm test
   - Result:  144 passed across 14 test files (0 failures)
   - Linter:  npm run lint -> 0 errors, 0 warnings (ESLint 8 + eslint-config-react-app)
   - Build:   npm run build -> 2,274 modules transformed, 0 errors in 7.76s

2. Mobile Application:
   - Command: npm test -- --runInBand
   - Result:  264 passed across 19 test suites (57 skipped live server tests)
   - Types:   npm run typecheck -> tsc --noEmit passed with 0 errors
   - Linter:  npm run lint -> expo lint passed with 0 warnings

3. Machine Learning Pipeline:
   - Command: python -m pytest ml/
   - Result:  31 passed (data cleaning, feature engineering, predictor, model artifacts)

4. Backend Unit & Prediction Engine:
   - Command: python -m pytest backend/tests/test_health_score.py ... test_prediction_service.py
   - Result:  192 passed in-memory (146 pure unit + 46 ML prediction service)
====================================================================================================
TOTAL VERIFIED AUTOMATED TESTS: 631 PASSED
====================================================================================================
```

*(Note: The full 412 backend integration tests pass against an active MySQL/MariaDB database server with `healthpredict_test` initialized, as documented in prior phase handoffs).*

---

## 5. Verified Checks vs. Untested / Device-Dependent Checks

To maintain academic rigor and transparency:
- **Verified**: All 627 automated test suites, TypeScript compilation, ESLint validation across web and mobile (0 errors, 0 warnings), Vite production bundling, ML monotonicity and shape invariants, and secret-free repository packaging.
- **Untested**: Live visual verification inside a physical browser (verified via headless jsdom test environments); physical mobile device testing (touch gestures, hardware biometric SecureStore, native share sheet, physical vibration); live connection to the local Windows MySQL instance (the service is active but requires creating the `hp_user` credentials and running `database/schema.sql`).
- **Scope Disclosures**:
  - **Remote Push Notifications & SMTP**: Remote push notifications (APNs/FCM) and external SMTP email delivery are not implemented. The system utilizes in-app database notifications for web and mobile, and on-device local notifications (via Expo Notifications). Password reset and verification generate secure tokens logged to the developer environment.
  - **Medication Reminder Horizons & Device Mechanics**:
    - **Backend Schedule Auto-Extension**: Active medications dynamically auto-extend their schedule rows forward via `ensure_schedule_ahead(db, medicine, days_ahead=90)`, resolving the prior 90-day finite horizon limitation.
    - **Mobile Rolling Window**: The mobile app schedules a rolling 14-day window of local reminders (capped at 60 notifications per iOS architectural limits), refreshing whenever the app is opened, returned to the foreground, or when doses are logged.
    - **Real-Device Note**: Without remote push delivery (APNs/FCM), if a device remains unlaunched past the rolling 14-day window, local notifications naturally exhaust until the user next opens the app.

---

## 6. Quick Start & Execution Guide

### Step 1: Database Initialization (MySQL 8.0+)
```bash
mysql -u root -p
CREATE DATABASE healthpredict CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE healthpredict_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hp_user'@'localhost' IDENTIFIED BY 'hp_password_123';
GRANT ALL PRIVILEGES ON healthpredict.* TO 'hp_user'@'localhost';
GRANT ALL PRIVILEGES ON healthpredict_test.* TO 'hp_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

mysql -u hp_user -p healthpredict < database/schema.sql
mysql -u hp_user -p healthpredict_test < database/schema.sql
```

### Step 2: Backend API
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Ensure DATABASE_URL in .env matches: mysql+pymysql://hp_user:hp_password_123@localhost:3306/healthpredict
python seed_data.py
python -m uvicorn app.main:app --reload --port 8000
```
- API Root: `http://localhost:8000`
- Swagger UI Documentation: `http://localhost:8000/api/docs`

### Step 3: Web Application
```bash
cd web
npm install
cp .env.example .env.local
npm run dev        # Starts Vite dev server at http://localhost:5173
npm test           # Runs 140 vitest tests
npm run lint       # Runs ESLint (0 errors, 0 warnings)
npm run build      # Builds production assets in dist/
```

### Step 4: Mobile Application
```bash
cd mobile
npm install
cp .env.example .env  # Configure EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:8000/api
npm test -- --runInBand  # Runs 264 Jest tests
npm run typecheck        # Runs TypeScript check (0 errors)
npm run lint             # Runs Expo linter (0 warnings)
npx expo start           # Starts Expo development server
```

---

## 7. Demo Accounts & Presentation Guide

### Pre-Seeded Accounts (via `seed_data.py`)
1. **Administrator Account**:
   - Email: `admin@healthpredict.local`
   - Password: Value of `ADMIN_PASSWORD` from `.env`
   - Capabilities: Access to `/admin`, aggregate user metrics, ML model health, account deactivation/reactivation, immutable audit log.
2. **Demo Member Account**:
   - Email: `demo@healthpredict.local`
   - Password: Value of `DEMO_PASSWORD` from `.env`
   - Capabilities: Full access to Health Assessment, 0–100 score, SHAP explanation factors, medicine schedules, wellness logs, goals, weekly PDF reports, and notification bell.

### Evaluation & Viva Talking Points
- **Explainable AI (XAI)**: We chose Gradient Boosting with SHAP over a "black box" deep neural network because clinical decision-making requires transparency. The SHAP values quantify exactly how much systolic BP, cholesterol, age, and activity contribute in log-odds space to the risk score.
- **Data Integrity**: BMI is computed in the MySQL layer via a `STORED` generated column (`weight_kg / POW(height_cm/100, 2)`), preventing floating-point discrepancies between backend and clients.
- **Security & Hygiene**: Deactivated accounts lose access immediately because `get_current_user` queries the database on every request rather than trusting stale JWT tokens.
- **Compliance & Disclaimer**: The system explicitly states it is an academic screening tool, displaying clear disclaimers across the web landing page, mobile app, and generated ReportLab PDFs.
