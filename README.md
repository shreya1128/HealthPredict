# HealthPredict

## Healthcare Prediction & Risk Screening, Wellness Tracking & Medication Management System

A full-stack healthcare platform combining machine learning-based heart risk assessment, medication management, wellness tracking, and comprehensive health analytics.

**Status:** Hardened & Validated — Full-Stack Verification Across Web, Mobile, and Backend

---

## 🎯 Project Overview

HealthPredict is a complete healthcare ecosystem consisting of:

- **Web Application** (React + Vite + Tailwind CSS)
- **Mobile Application** (React Native + Expo)
- **FastAPI Backend** (Python, SQLAlchemy, JWT Auth)
- **MySQL Database** (Normalized healthcare schema)
- **ML Prediction Engine** (scikit-learn, model comparison, SHAP)
- **Admin Dashboard** (Analytics, user management, audit logs)
- **Comprehensive Tracking** (Medicines, exercise, sleep, hydration, nutrition)

---

## ✨ Core Features

### User Features
- 🔐 Secure authentication & authorization
- 📋 Comprehensive health profile management
- 🩺 Health assessment with AI-powered analysis
- 📊 Health score (0-100) with breakdown
- 💊 Complete medication management & adherence tracking
- 🏃 Exercise, sleep, hydration, nutrition logging
- 🎯 Wellness goals & progress tracking
- 📈 Beautiful charts & analytics
- 🔔 In-app notification inbox (web + mobile) and on-device medicine & wellness reminders *(remote push is not set up; see `docs/notifications.md`)*
- 📄 Weekly health reports (PDF)
- 💡 Personalized wellness insights

### Admin Features
- 👥 User management & activation
- 📊 System analytics dashboard
- 🤖 ML model performance tracking
- 📋 Audit logs & compliance
- 🔍 Assessment & prediction analytics

### Technical Features
- Machine Learning prediction pipeline
- Model comparison (4+ algorithms)
- Explainable AI (SHAP)
- Role-based access control
- JWT authentication
- Responsive design (desktop/mobile/tablet)
- Error handling & validation
- Security best practices

---

## 📦 Technology Stack

### Frontend
- React 18 + Vite
- TailwindCSS + Lucide Icons
- Recharts (data visualization)
- Axios (HTTP client)
- React Router (navigation)

### Mobile
- React Native + Expo
- Expo Router, plain `StyleSheet` + design tokens (NativeWind was dropped, see `mobile/README.md`)
- Expo Notifications
- React Native Charts

### Backend
- Python 3.11+
- FastAPI
- SQLAlchemy ORM
- Pydantic (validation)
- JWT (authentication)

### Database
- MySQL 8.0+
- Properly normalized schema
- Foreign keys & indexes

### Machine Learning
- pandas, NumPy, scikit-learn (GradientBoostingClassifier, RandomForest, LogisticRegression)
- SHAP (TreeExplainer for individualized clinical feature importance)
- Joblib (model persistence), Matplotlib (training curves)

### Deployment Ready
- Docker support
- Environment configuration
- Seed data scripts

---

## 🗂️ Project Structure

```
HealthPredict/
├── web/                    # React web application
├── mobile/                 # React Native mobile app
├── backend/                # FastAPI backend
├── ml/                     # ML pipeline & models
├── database/               # Database schema & migrations
├── docs/                   # Documentation
└── README.md              # This file
```

See `DEVELOPMENT_PHASES.md` for detailed development plan.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- MySQL 8.0+
- Git

### Setup
See **QUICK_START.md** for the exact, verified commands (database, backend, tests, web).

## 📊 ML Pipeline

### Dataset
- Cardiovascular Disease Clinical Dataset
- **68,569 cleaned patient records** (preprocessed from 70,000 raw records with outlier removal and clinical validity filters)
- Features: Age (calculated from DOB), Gender, Height, Weight, BMI, Systolic & Diastolic Blood Pressure, Cholesterol Level, Blood Glucose, Smoking Status, Alcohol Intake, Physical Activity
- Target: 10-year cardiovascular risk indication (binary classification)

### Models Evaluated & Champion Model
1. **Gradient Boosting Classifier (Champion / Production Model)**: 73.4% test accuracy, **0.801 ROC-AUC**, 0.73 F1-score
2. **Random Forest Classifier**: 71.9% accuracy, 0.789 ROC-AUC
3. **Logistic Regression**: 72.1% accuracy, 0.785 ROC-AUC
4. **Decision Tree Classifier**: 63.2% accuracy, 0.698 ROC-AUC

### Explainable AI (SHAP)
- TreeExplainer computes exact SHAP contribution values for each individual vital and lifestyle feature.
- Patient-facing translations: Maps raw log-odds to understandable risk factors with direction (*protective* vs *elevating risk*) and relative influence rank.

### Integration
- Integrated seamlessly within `POST /api/health/assessment`.
- Combines the 0–100 rule-based multi-factor Health Score with machine learning risk estimates.
- Results include probability, confidence level, model version (`gb_cardio_v1`), top SHAP factors, personalized explanations, and clinical disclaimers.

---

## 🔐 Security Features

- ✅ Password hashing (bcrypt)
- ✅ JWT authentication
- ✅ Role-based authorization
- ✅ Protected API endpoints
- ✅ SQL injection protection (SQLAlchemy ORM)
- ✅ CORS configuration
- ✅ Environment-based secrets
- ✅ Audit logging
- ✅ Input validation

---

## 📝 Demo Accounts

### Admin
- Email: `admin@healthpredict.local`
- Password: set `ADMIN_PASSWORD` in `backend/.env`, then run `python seed_data.py`

### User
- Email: `demo@healthpredict.local`
- Password: set `ADMIN_PASSWORD` in `backend/.env`, then run `python seed_data.py`

---

## ⚠️ Healthcare Disclaimer

**Important:** This application is intended for educational and wellness purposes only. 

Health scores, predictions, and recommendations are **NOT** medical diagnoses and should not replace professional medical advice, diagnosis, or treatment. 

**Always consult a qualified healthcare professional for medical concerns.**

---

## 📚 Documentation

- `docs/architecture.md` - Complete system architecture & data flows
- `docs/database.md` - Relational database schema & 19 tables explanation
- `docs/api.md` - Complete REST API specification
- `docs/ml-methodology.md` - ML pipeline, dataset cleaning, training, SHAP explainability
- `docs/health-scoring.md` - Multi-dimensional health score formula & validation
- `docs/security.md` - Authentication, RBAC, timing mitigations, and audit logs
- `docs/notifications.md` - In-app notification inbox & on-device reminder architecture
- `QUICK_START.md` - Step-by-step setup and testing guide
- `STATUS.md` - Full verified status, test evidence, and limitations

---

## 🧪 Testing

### Backend Testing (Python / Pytest)
```bash
# Pure unit tests + ML prediction service (runs in-memory without database)
python -m pytest backend/tests/test_health_score.py backend/tests/test_goal_progress.py backend/tests/test_schedule_generator.py backend/tests/test_sleep_duration.py backend/tests/test_wellness_insights.py backend/tests/test_prediction_service.py

# Machine Learning pipeline tests
python -m pytest ml/

# Full backend integration suite (requires MySQL/MariaDB test database)
export TEST_DATABASE_URL='mysql+pymysql://hp_user:password@localhost:3306/healthpredict_test'
python -m pytest backend/tests/
```

### Web Frontend Testing (Vitest & ESLint)
```bash
cd web
npm test       # 170 vitest unit/contract tests across 16 test files
npm run lint   # ESLint 8 verification (0 errors, 0 warnings)
npm run build  # Vite production build (0 errors)
```

### Mobile Application Testing (Jest & TypeScript)
```bash
cd mobile
npm test -- --runInBand  # 264 Jest unit & router-flow tests across 19 suites
npm run typecheck        # TypeScript --noEmit validation (0 errors)
npm run lint             # Expo ESLint verification (0 warnings)
```

---

## ⚠️ Scope & Known Limitations

- **Mobile Client Scope**: The React Native mobile app focuses on core daily flows: medication logging, vitals logging, quick health entry, adherence review, and notifications. Several web-first modules are not yet implemented on mobile: Emergency Medical Card, Doctor Appointments, Family Care Profile switcher, custom Goals builder, and the Health Timeline.
- **Machine Learning Scope**: Only the cardiovascular heart assessment utilizes machine learning (`ml/models/best_model.joblib`) with SHAP explainability. Diabetes screening (ADA risk scoring), PCOS screening (Rotterdam criteria), and Fatty Liver screening (FIB-4 clinical calculator) are rule-based clinical scoring algorithms.
- **External Account Integrations**: Medicine box OCR scanning requires a Google Cloud Vision API key; Web push requires configured VAPID key pairs; Real transactional email requires an SMTP server or Resend API key (a mock memory backend is provided for testing); Expo Go push notification delivery requires an EAS project setup and physical device testing.
- **Wearable Device Data**: Physical device Bluetooth syncing requires mobile native permissions (Apple HealthKit / Health Connect). The web app provides an optional developer ingestion simulator gated behind `VITE_ENABLE_DEMO=true` with one-click cleanup of simulated records.

---

## 📈 Development Status
See **STATUS.md** for what is built, how each part was verified, and known limitations.

## 🤝 Engineering & Architecture

All development follows the production architecture and guidelines documented in `docs/architecture.md`.

---

## 📄 License

HealthPredict Platform © 2026. All rights reserved.

---

## 📞 Support & Documentation

For issues or questions about the system architecture, refer to the documentation in the `docs/` directory.

