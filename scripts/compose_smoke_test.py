#!/usr/bin/env python3
"""Smoke test for docker-compose services using Python standard library only.

Tests:
1. GET /api/health -> 200 OK
2. POST /api/auth/register -> 201 Created (or login if exists)
3. POST /api/auth/login -> 200 OK (returns access_token)
4. GET /api/auth/me -> 200 OK (authenticated profile access)
5. POST /api/health/assessment -> 201 Created (health assessment with vitals)
6. GET /api/health/assessment/history -> 200 OK (assessment history)

Usage:
    python scripts/compose_smoke_test.py [--base-url http://localhost:8000]
"""

import argparse
import json
import random
import string
import sys
import urllib.error
import urllib.request


def request(url: str, method: str = "GET", data: dict | None = None, headers: dict | None = None) -> tuple[int, dict]:
    headers = headers or {}
    encoded_data = None
    if data is not None:
        encoded_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            return status_code, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return exc.code, parsed
    except urllib.error.URLError as exc:
        print(f"Network error connecting to {url}: {exc}")
        sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="HealthPredict compose smoke test (stdlib only)")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Base URL of backend API")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    print(f"Running smoke test against {base_url}...")

    # 1. Health check
    print("1. Checking /api/health...")
    status, body = request(f"{base_url}/api/health")
    if status != 200 or body.get("status") != "ok":
        print(f"FAILED: /api/health returned {status}: {body}")
        return 1
    print(f"   PASS: ml_model_loaded={body.get('ml_model_loaded')}")

    # 2. Register a temporary user
    rnd = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    email = f"smoketest_{rnd}@example.com"
    password = "Sm0ke!TestPassword123"
    print(f"2. Registering test user {email}...")
    reg_payload = {
        "email": email,
        "password": password,
        "confirm_password": password,
        "full_name": "Smoke Tester",
    }
    status, body = request(f"{base_url}/api/auth/register", method="POST", data=reg_payload)
    if status != 201:
        print(f"FAILED: Registration returned {status}: {body}")
        return 1
    print("   PASS: User registered successfully.")

    # 3. Login
    print("3. Logging in...")
    login_payload = {
        "email": email,
        "password": password,
    }
    status, body = request(f"{base_url}/api/auth/login", method="POST", data=login_payload)
    if status != 200 or "access_token" not in body:
        print(f"FAILED: Login returned {status}: {body}")
        return 1
    token = body["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}
    print("   PASS: Received JWT access token.")

    # 4. Authenticated profile access
    print("4. Checking GET /api/auth/me...")
    status, body = request(f"{base_url}/api/auth/me", headers=auth_headers)
    if status != 200 or body.get("email") != email:
        print(f"FAILED: /api/auth/me returned {status}: {body}")
        return 1
    print(f"   PASS: Authenticated as {body.get('email')}")

    # 5. Health assessment with vitals (uses the actual AssessmentCreate schema)
    print("5. Testing POST /api/health/assessment...")
    assessment_payload = {
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "heart_rate_bpm": 72,
        "blood_glucose_mg_dl": 95,
        "spo2_percent": 98.5,
        "temperature_celsius": 36.6,
    }
    status, body = request(f"{base_url}/api/health/assessment", method="POST", data=assessment_payload, headers=auth_headers)
    if status != 201:
        print(f"FAILED: Assessment returned {status}: {body}")
        return 1
    print(f"   PASS: Assessment created! Score={body.get('health_score')}, Risk={body.get('risk_category')}")

    # 6. Assessment history
    print("6. Checking GET /api/health/assessment/history...")
    status, body = request(f"{base_url}/api/health/assessment/history", headers=auth_headers)
    if status != 200 or "items" not in body:
        print(f"FAILED: Assessment history returned {status}: {body}")
        return 1
    print(f"   PASS: {body.get('total', 0)} assessment(s) in history.")

    print("\nALL SMOKE CHECKS PASSED SUCCESSFULLY.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
