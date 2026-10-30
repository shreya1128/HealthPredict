"""Tests for caregiver invitation email delivery tracking."""

import pytest
from unittest.mock import patch


def test_caregiver_invite_email_delivered(client, auth_headers, outbox):
    h = auth_headers("owner@test.com")
    payload = {
        "caregiver_email": "nurse_mary@test.com",
        "access_level": "VIEW_ONLY",
        "notify_missed_dose": True,
    }
    r = client.post("/api/care-profiles/caregivers/invite", headers=h, json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["caregiver_email"] == "nurse_mary@test.com"
    assert data["email_delivered"] is True
    assert data["email_delivery_status"] == "DELIVERED"

    # Verify email was captured in memory outbox
    box = outbox()
    assert len(box) == 1
    assert box[0]["to"] == "nurse_mary@test.com"
    assert "Caregiver Invitation" in box[0]["html_body"]

    # Verify listing includes delivery status
    list_r = client.get("/api/care-profiles/caregivers/invites", headers=h)
    assert list_r.status_code == 200
    invites = list_r.json()
    assert len(invites) == 1
    assert invites[0]["email_delivered"] is True
    assert invites[0]["email_delivery_status"] == "DELIVERED"


def test_caregiver_invite_handles_email_failure_gracefully(client, auth_headers):
    h = auth_headers("owner2@test.com")
    payload = {
        "caregiver_email": "nurse_bob@test.com",
        "access_level": "VIEW_ONLY",
        "notify_missed_dose": True,
    }
    with patch("app.services.care_profile_service.send_caregiver_invitation", return_value=False):
        r = client.post("/api/care-profiles/caregivers/invite", headers=h, json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data["caregiver_email"] == "nurse_bob@test.com"
        assert data["email_delivered"] is False
        assert data["email_delivery_status"] == "FAILED"

    # Verify listing reflects FAILED status
    list_r = client.get("/api/care-profiles/caregivers/invites", headers=h)
    assert list_r.status_code == 200
    invites = list_r.json()
    assert invites[0]["email_delivered"] is False
    assert invites[0]["email_delivery_status"] == "FAILED"
