# HealthPredict Security Architecture & Review

This document provides a comprehensive security review and architecture breakdown of HealthPredict for academic evaluation and clinical data governance.

---

## 1. Threat Model & Security Principles

HealthPredict processes sensitive personal health data, medication schedules, and clinical risk assessments. The system is designed under the following core principles:

1. **Least Privilege**: Users have access only to their own health records; administrators have aggregate system oversight but cannot browse individual health journals or assessments.
2. **Defense in Depth**: Security controls are enforced at the network (CORS), framework (FastAPI middleware), route (dependency injection), and database layers (parameterized queries & relational constraints).
3. **Fail-Closed & Constant-Time Verification**: Unauthenticated requests or invalid tokens fail closed. Password verification incorporates dummy hash operations to mitigate user-enumeration timing attacks.
4. **Auditability**: State-changing administrative actions (such as account deactivations) are immutably logged with admin identities, timestamps, and target entities.

---

## 2. Authentication & Credential Management

### 2.1 Password Hashing
- **Algorithm**: `bcrypt` with configurable cost factor (`BCRYPT_ROUNDS = 12` in production, `4` in test suites for performance).
- **Timing Attack Mitigation**: When an email lookup fails during login, `verify_password` hashes against a constant dummy hash (`_DUMMY_HASH`) so that response time does not reveal whether the email exists in the database.

### 2.2 JWT Access Tokens
- **Algorithm**: HMAC-SHA256 (`HS256`) signed with server-side `SECRET_KEY`.
- **Payload Structure**:
  - `sub`: User ID (integer as string)
  - `role`: User role (`USER` or `ADMIN`)
  - `type`: Explicit token type (`access`)
  - `iat`: Timestamp issued (UTC)
  - `exp`: Expiration timestamp (default: 30 minutes)
- **Token Verification**: Tokens are validated on every request. Additionally, `get_current_user` performs a database lookup to ensure the account has not been deactivated or deleted mid-session.

### 2.3 Refresh Tokens & Tokens at Rest
- **Generation**: Cryptographically secure 48-byte URL-safe strings (`secrets.token_urlsafe(48)`).
- **Storage at Rest**: Plaintext tokens are **never** stored in the database. Only the SHA-256 hex digest (`hash_token(token)`) is persisted in `user_tokens`.
- **Revocation**: Refresh tokens are revoked upon logout, password reset, or token reuse detection.

---

## 3. Authorization & Role-Based Access Control (RBAC)

### 3.1 Role Hierarchy
The platform defines two roles:
- `USER`: Regular members with access to their own profile, assessments, medication logs, tracking metrics, goals, reports, and notifications.
- `ADMIN`: Platform operators with access to aggregate system analytics, ML model metrics, user management, and audit logs.

### 3.2 Real-Time Role and Status Validation
Unlike stateless systems that trust the JWT payload until expiration, HealthPredict re-validates user status against MySQL on each request in `get_current_user`:
```python
user = db.get(User, int(payload["sub"]))
if user is None or not user.is_active:
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
```
If an administrator deactivates an account, existing active JWTs are rejected immediately on the very next API call.

### 3.3 Ownership Isolation
All member endpoints enforce tenant isolation:
- Assessments (`/api/health/assessment`)
- Medicines (`/api/medicines`)
- Wellness logs (`/api/tracking/exercise`, `/api/tracking/sleep`, etc.)
- Goals (`/api/goals`)
- Reports (`/api/reports`)
- Notifications (`/api/notifications`)

Database queries strictly filter by `user_id = user.id`. Foreign IDs belonging to other users return HTTP `404 Not Found` rather than `403 Forbidden` to prevent object identifier enumeration.

---

## 4. Input Validation & Data Sanitization

### 4.1 Strict Pydantic Schemas
All client payloads are validated against strict Pydantic models before reaching route handlers:
- Blood pressure: Systolic (60–260 mmHg), Diastolic (40–180 mmHg)
- BMI & Vitals: Positive physiological ranges
- Cholesterol & Glucose: Valid clinical enum categories (`NORMAL`, `ABOVE_NORMAL`, `WELL_ABOVE_NORMAL`)
- Dates: Formatted ISO-8601 strings with boundary checks

### 4.2 SQL Injection Prevention
- All database operations utilize SQLAlchemy 2.0 ORM query builders and parameterized `select()`/`insert()` statements.
- Direct string formatting or concatenation into SQL statements is prohibited.
- MySQL connections execute under strict SQL mode:
  ```sql
  SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'
  ```
  This ensures out-of-range values or truncated strings cause database errors rather than silent data corruption.

---

## 5. Rate Limiting & Denial of Service Protection

- **Rate Limiter**: Sliding-window in-memory limiter (`RateLimiter`) applied to sensitive authentication routes (`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`).
- **Configuration**:
  - `LOGIN_RATE_LIMIT`: Max 5 attempts
  - `LOGIN_RATE_WINDOW_SECONDS`: 60-second rolling window
  - Exceeding the threshold returns HTTP `429 Too Many Requests`.

---

## 6. Audit Logging & Administrative Governance

- State-changing admin operations (e.g., account activation, deactivation) are written to `audit_logs` table via `admin_service.py`.
- **Logged Attributes**: Admin user ID, admin email, action type, target entity ID, old/new values, IP address, and status.
- **Admin Self-Protection**: Admins cannot deactivate their own accounts (`target_id == admin.id` returns 400 and audits the blocked attempt). This ensures at least one active administrator always remains present.

---

## 7. Known Security Trade-offs & Production Recommendations

| Current Project Implementation | Production Recommendation for Live Hospital/Enterprise Deployment |
|---|---|
| In-memory rate limiting (`rate_limiter.py`) | Distributed Redis token-bucket limiter across multiple worker processes. |
| Tokens stored in browser `localStorage` | HttpOnly, Secure, SameSite=Strict cookies to guard against XSS token exfiltration. |
| Console logging of password reset tokens in development | Transactional email provider (SendGrid, AWS SES) with DKIM/SPF verification. |
| Symmetric HMAC-SHA256 JWT signing | Asymmetric RSA or ECDSA (RS256/ES256) key pairs with regular rotation. |
| On-device SQLite/mocked storage for mobile | Hardware-backed keystore via `expo-secure-store` with biometric gating. |
