> **Note:** the route lists in this document are the original *design sketch*. `docs/api.md` is authoritative for what is
> implemented (e.g. the profile endpoint is `/api/profile`, not `/api/users/profile`).

# HealthPredict Architecture Documentation

## System Overview

HealthPredict is a full-stack healthcare platform using a distributed multi-tier architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
├──────────────────────────┬──────────────────────────────────────┤
│   Web Application        │      Mobile Application              │
│   (React + Vite)         │      (React Native + Expo)           │
│   - Dashboard            │      - Home Screen                   │
│   - Health Assessment    │      - Health Management             │
│   - Analytics            │      - Medicine Tracking             │
│   - Medicine Management  │      - Progress Tracking             │
│   - Admin Dashboard      │      - Push Notifications            │
└──────────────────────────┴──────────────────────────────────────┘
                              ↓
                         REST API (HTTPS)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (FastAPI)                        │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Auth Routes │  │ Health Routes│  │ Medicine API │            │
│  └─────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Tracking API │  │ Reports API  │  │ Admin Routes │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────────────────────────────────────────────────────┐
│  │        Middleware (Auth, CORS, Error Handling)             │
│  └──────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
┌──────────────────────┐              ┌──────────────────────┐
│  DATABASE LAYER      │              │  ML INFERENCE LAYER  │
│  (MySQL)             │              │  (Python)            │
├──────────────────────┤              ├──────────────────────┤
│ • Users              │              │ • Model Loader       │
│ • Health Data        │              │ • Prediction Engine  │
│ • Medicine Records   │              │ • Feature Transform  │
│ • Tracking Data      │              │ • SHAP Explainer     │
│ • Audit Logs         │              └──────────────────────┘
└──────────────────────┘
```

---

## Detailed Layer Architecture

### 1. CLIENT LAYER

#### Web Application (React)
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context + Zustand
- **Data Fetching**: Axios + React Query
- **Routing**: React Router v6

**Key Components:**
- AuthContext (authentication state)
- ProtectedRoute (authorization)
- API service layer (centralized API calls)
- Custom hooks (reusable logic)

**Entry Points:**
- Landing page (unauthenticated)
- Dashboard (authenticated users)
- Admin console (admin users)

#### Mobile Application (React Native)
- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing)
- **Styling**: NativeWind (Tailwind for React Native)
- **State**: AsyncStorage + Zustand
- **HTTP**: Axios

**Key Features:**
- Tab-based navigation
- Push notifications (Expo Notifications)
- Offline support (AsyncStorage)
- Native UI components

---

### 2. API LAYER (FastAPI)

#### Architecture Pattern: Layered (N-tier)

```
Routes (FastAPI endpoints)
    ↓
Middleware (Auth, Error handling)
    ↓
Services (Business logic)
    ↓
Database Models (ORM)
    ↓
Database
```

#### Route Organization

**Auth Routes** (`/api/auth/`)
```
POST   /register      - User registration
POST   /login         - User login
POST   /logout        - User logout
POST   /refresh-token - Token refresh
POST   /forgot-password - Password reset request
POST   /reset-password  - Password reset completion
```

**User Routes** (`/api/users/`)
```
GET    /profile       - Get user profile
PUT    /profile       - Update profile
GET    /overview      - Health overview
```

**Health Routes** (`/api/health/`)
```
POST   /assessment    - Submit health assessment
GET    /assessment/:id - Get specific assessment
GET    /assessment/history - Get all assessments
PUT    /assessment/:id - Update assessment
GET    /history       - Health history with pagination
```

**Prediction Routes** (`/api/prediction/`)
```
POST   /analyze       - Get health prediction
GET    /history       - Prediction history
GET    /:id/explainability - Get feature importance
```

**Medicine Routes** (`/api/medicines/`)
```
GET    /             - List medicines
POST   /             - Add medicine
GET    /:id          - Get medicine details
PUT    /:id          - Update medicine
DELETE /:id          - Delete medicine
```

**Medicine Tracking** (`/api/medicines/:id/`)
```
POST   /taken         - Log medicine taken
POST   /skipped       - Log medicine skipped
GET    /adherence     - Get adherence stats
GET    /schedule      - Get medicine schedule
```

**Tracking Routes** (`/api/tracking/`)
```
POST   /exercise      - Log exercise
GET    /exercise      - Get exercise logs
POST   /sleep         - Log sleep
GET    /sleep         - Get sleep logs
POST   /hydration     - Log water intake
GET    /hydration     - Get hydration logs
POST   /nutrition     - Log meal
GET    /nutrition     - Get nutrition logs
```

**Goals Routes** (`/api/goals/`)
```
GET    /             - List goals
POST   /             - Create goal
PUT    /:id          - Update goal
DELETE /:id          - Delete goal
GET    /:id/progress - Get goal progress
```

**Reports Routes** (`/api/reports/`)
```
GET    /weekly       - Get weekly report
GET    /weekly/pdf   - Download PDF report
```

**Notifications** (`/api/notifications/`)
> *Original design sketch. The implemented API differs (no DELETE, notifications are derived on `POST /refresh`, `POST /:id/read`, `/read-all`, `/unread-count`); remote push and a background scheduler are NOT implemented. See `notifications.md`.*
```
GET    /             - Get notifications
PUT    /:id/read     - Mark as read
DELETE /:id          - Delete notification
```

**Admin Routes** (`/api/admin/`)
```
GET    /dashboard    - Admin dashboard stats
GET    /users        - List all users
GET    /users/:id    - Get user details
PUT    /users/:id/status - Activate/deactivate user
GET    /assessments  - Assessment analytics
GET    /predictions  - Prediction analytics
GET    /ml-performance - ML model performance
GET    /audit-logs   - Admin audit logs
```

#### Service Layer

Services implement business logic and are used by routes:

```python
# Example service structure
class HealthService:
    def calculate_health_score(assessment_data):
        # Complex health score calculation
        
    def get_health_history(user_id, days):
        # Query and format health history
        
    def get_health_trends(user_id):
        # Analyze trends

class PredictionService:
    def analyze_health(assessment_data):
        # Load model, preprocess, predict
        
    def get_feature_importance(assessment_id):
        # Get SHAP values or importance

class MedicineService:
    def add_medicine(user_id, medicine_data):
        # Create medicine record
        
    def calculate_adherence(medicine_id):
        # Calculate adherence percentage
        
    def generate_schedule(medicine):
        # Generate medicine schedule
```

#### Middleware Stack

1. **CORS Middleware** - Cross-origin requests
2. **Auth Middleware** - Token validation
3. **Error Handler Middleware** - Exception handling
4. **Rate Limiter Middleware** - Request throttling
5. **Logging Middleware** - Request/response logging

#### Request Flow Example

```
User Request
    ↓
CORS Check → Auth Check → Route Handler
    ↓
Validate Input (Pydantic)
    ↓
Get DB Session
    ↓
Call Service Layer
    ↓
Query Database
    ↓
Process Response
    ↓
Return JSON
    ↓
Error Handler (if error)
    ↓
Send Response to Client
```

---

### 3. DATABASE LAYER

#### MySQL Schema Design

**Normalization**: 3NF (Third Normal Form)

**Key Principles:**
- Foreign key constraints for referential integrity
- Proper indexing for query performance
- Separate tables for different entities
- JSON columns for flexible data (allergies, family history)

#### Table Organization

**Authentication & Users:**
- `users` - Core user accounts
- `user_profiles` - Extended user information
- `admin_audit_logs` - Admin activity tracking

**Health Data:**
- `health_assessments` - Health evaluations
- `health_predictions` - ML prediction results
- `health_history` - Time-series health data

**Medicines:**
- `medicines` - Prescribed medicines
- `medicine_schedules` - When to take medicines
- `medicine_intake_logs` - Adherence tracking

**Wellness Tracking:**
- `exercise_logs` - Exercise records
- `sleep_logs` - Sleep records
- `hydration_logs` - Water intake
- `nutrition_logs` - Meal records

**Goals:**
- `wellness_goals` - User goals
- `goal_progress` - Progress tracking

**Notifications:**
- `notifications` - User notifications
- `weekly_reports` - Generated reports

**ML Metadata:**
- `ml_model_info` - Model performance tracking

#### Indexing Strategy

```
Primary Indexes:
- users(email) - For login
- users(role) - For authorization
- health_assessments(user_id, assessment_date)
- medicines(user_id, is_active)
- notifications(user_id, is_read)

Composite Indexes:
- medicine_schedules(medicine_id, scheduled_date)
- health_history(user_id, tracking_date DESC)
- exercise_logs(user_id, exercise_date DESC)
```

#### Connection Pool

```python
pool_size = 10
max_overflow = 20
pool_recycle = 3600  # Recycle connections after 1 hour
pool_pre_ping = True  # Test connections before use
```

---

### 4. ML INFERENCE LAYER

#### Model Architecture

```
Input Data (Health Assessment)
    ↓
Feature Preprocessing
    ├─ Encoding categorical variables
    ├─ Scaling numerical features
    └─ Feature normalization
    ↓
Model Prediction
    ├─ Random Forest (primary)
    └─ Ensemble voting
    ↓
Post-processing
    ├─ Confidence calculation
    ├─ Risk level classification
    └─ Feature importance
    ↓
Explainability (SHAP)
    ├─ Feature contribution
    └─ Local explanations
    ↓
Output (Prediction + Explanation)
```

#### Model Loading & Caching

```python
# At application startup
model = load_model('saved_models/best_model.pkl')
scaler = load_scaler('saved_models/feature_scaler.pkl')
feature_names = load_features('saved_models/feature_names.pkl')

# In prediction endpoint
# Model loaded once, reused for all predictions
def predict(assessment_data):
    X_scaled = scaler.transform([assessment_data])
    prediction = model.predict_proba(X_scaled)[0]
    risk_score = prediction[1]  # Probability of positive class
    return risk_score
```

#### Feature Importance Calculation

```
Method 1: Tree-based Feature Importance
- Built-in model.feature_importances_
- Shows which features the model used most

Method 2: SHAP Values
- Calculate Shapley values
- Show each feature's contribution
- Better interpretability for users
- Per-prediction explanations

Display:
"Blood Pressure (High)"     ████████ (30%)
"BMI (Overweight)"          ███████  (25%)
"Exercise Frequency (Low)"  ██████   (20%)
```

#### Integration with FastAPI

```python
# prediction_service.py
class PredictionService:
    def __init__(self):
        self.model = load_model()
        self.scaler = load_scaler()
        self.explainer = load_shap_explainer()
    
    def predict(self, features):
        X = self.scaler.transform([features])
        pred = self.model.predict_proba(X)
        risk_score = pred[0][1]
        
        # Get SHAP values
        shap_values = self.explainer.shap_values(X)
        
        return {
            'risk_score': risk_score,
            'risk_level': classify_risk(risk_score),
            'confidence': max(pred[0]),
            'feature_importance': extract_importance(shap_values)
        }

# routes/prediction.py
@router.post('/analyze')
def analyze_health(data: HealthAssessmentSchema, user = Depends(get_current_user)):
    prediction = prediction_service.predict(data.dict())
    
    # Store prediction in database
    store_prediction(user.id, prediction)
    
    return prediction
```

---

## Data Flow Examples

### Example 1: User Registration & Authentication

```
Frontend (Register Form)
    ↓ POST /api/auth/register
    │ {email, password, full_name, ...}
    ↓
Backend (Route)
    ├─ Validate input with Pydantic
    ├─ Hash password with bcrypt
    ├─ Check email uniqueness
    ↓
Service Layer
    ├─ Create user record
    ├─ Create user profile
    ↓
Database
    ├─ INSERT users
    ├─ INSERT user_profiles
    ↓
Response
    │ {success: true, message: "Registration successful"}
    ↓
Frontend
    └─ Redirect to login
```

### Example 2: Health Assessment & Prediction

```
Frontend (Assessment Form)
    ↓ POST /api/health/assessment
    │ {systolic_bp: 130, diastolic_bp: 85, ...}
    ↓
Backend (Route)
    ├─ Validate input
    ├─ Get user profile
    ↓
Service Layer (HealthService)
    ├─ Calculate BMI
    ├─ Store assessment
    ├─ Calculate health score
    ↓
Database
    ├─ INSERT health_assessments
    │
ML Service (Async/Background)
    ├─ Load ML model
    ├─ Preprocess features
    ├─ Get prediction
    ├─ Calculate SHAP
    ├─ INSERT health_predictions
    ↓
Response
    │ {health_score: 78, risk_level: MODERATE}
    ↓
Frontend
    └─ Display results with charts
```

### Example 3: Medicine Adherence Tracking

```
Mobile App (Take Medicine)
    ↓ POST /api/medicines/:id/taken
    │ {timestamp, notes}
    ↓
Backend (Route)
    ├─ Verify medicine exists
    ├─ Verify authorization
    ↓
Service Layer
    ├─ Log intake
    ├─ Update schedule
    ├─ Calculate adherence
    ├─ Check if notification needed
    ↓
Database
    ├─ INSERT medicine_intake_logs
    ├─ UPDATE medicine_schedules
    │
Notification Service
    ├─ Check if adherence < threshold
    ├─ Send notification if needed
    ↓
Response
    │ {success: true, adherence: 92}
    ↓
Mobile App
    └─ Update UI
```

---

## Scalability Considerations

### Caching Strategy
- Cache health scores (short-lived, 1 hour)
- Cache ML model (entire session)
- Cache feature scalers (entire session)

### Database Optimization
- Indexes on frequently queried columns
- Partitioning large tables (health_history)
- Regular ANALYZE and OPTIMIZE

### API Rate Limiting
```
Per User:
- 100 requests per minute for general endpoints
- 10 requests per minute for ML endpoints

Per IP:
- 1000 requests per hour
```

### Async Processing
- Generate weekly reports asynchronously
- Send notifications in background
- ML predictions can be background tasks (future)

---

## Security Architecture

### Authentication
- Password hashing: bcrypt with salt rounds = 12
- JWT tokens: HS256 algorithm
- Token expiration: 30 minutes (short-lived)
- Refresh tokens: 7 days (long-lived)

### Authorization
- Role-based access control (RBAC)
- Two roles: USER, ADMIN
- Protected routes check user role
- Admin routes require admin role

### Data Protection
- SQL injection: SQLAlchemy ORM prevents
- CORS: Restricted to known origins
- HTTPS: Enforced in production
- Secrets: Environment variables (never hardcoded)

### Audit Trail
- Admin actions logged in audit_logs table
- User login times tracked
- Sensitive operations recorded

---

## Deployment Architecture

```
Production Environment:

Internet
    ↓
Load Balancer (SSL/TLS)
    ↓
┌─────────────────────────────────────────┐
│  Application Servers (Multiple)         │
│  ├─ FastAPI with Gunicorn               │
│  ├─ Load balanced                       │
│  └─ Auto-scaling capability             │
└─────────────────────────────────────────┘
    ↓
Shared Resources:
├─ Database (MySQL - replicated)
├─ Redis Cache (optional)
├─ ML Model Storage (S3 or local)
└─ File Storage (uploads)
```

---

## Technology Justification

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend | React | Large ecosystem, reusable components |
| Mobile | React Native | Code sharing with web (logic layer) |
| Backend | FastAPI | Modern, fast, great for APIs |
| Database | MySQL | Relational, structured healthcare data |
| ORM | SQLAlchemy | Industry standard, prevents SQL injection |
| Auth | JWT | Stateless, works across web/mobile |
| ML Framework | scikit-learn | Simple, performant, explainable |
| Explainability | SHAP | Industry standard for ML interpretability |

---

## Conclusion

HealthPredict uses a proven, scalable architecture suitable for an enterprise healthcare platform while remaining understandable and implementable for an academic project. The separation of concerns (client, API, database, ML) allows independent scaling and maintenance of each component.
