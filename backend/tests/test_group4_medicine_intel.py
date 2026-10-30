from datetime import date
from unittest.mock import MagicMock, patch
import httpx
import pytest

from app.models.medicine import DrugInteractionCache


def test_search_medicine_names_rxnav(client, auth_headers):
    h = auth_headers()
    mock_data = {
        "approximateGroup": {
            "candidate": [
                {"name": "Warfarin Sodium", "rxcui": "855332", "score": "100"},
                {"name": "Warfarin", "rxcui": "11289", "score": "95"}
            ]
        }
    }
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_data

        async def _mock_get(*args, **kwargs):
            return mock_resp

        mock_get.side_effect = _mock_get

        r = client.get("/api/medicines/search-names?query=warfarin", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert data[0]["name"] == "Warfarin Sodium"
        assert data[0]["rxcui"] == "855332"


def test_check_drug_interactions_found(client, auth_headers):
    h = auth_headers()
    mock_fda_data = {
        "results": [
            {
                "drug_interactions": [
                    "Concomitant use of Warfarin with Aspirin increases the risk of severe bleeding."
                ]
            }
        ]
    }
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_fda_data

        async def _mock_get(*args, **kwargs):
            return mock_resp

        mock_get.side_effect = _mock_get

        r = client.post("/api/medicines/check-interactions?drug_names=Warfarin&drug_names=Aspirin", headers=h)
        assert r.status_code == 200
        res = r.json()
        assert res["status"] == "found"
        assert len(res["interactions"]) == 1
        assert "Aspirin" in res["interactions"][0]["description"]


def test_check_drug_interactions_none_found(client, auth_headers):
    h = auth_headers()
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 404

        async def _mock_get(*args, **kwargs):
            return mock_resp

        mock_get.side_effect = _mock_get

        r = client.post("/api/medicines/check-interactions?drug_names=Acetaminophen&drug_names=VitaminC", headers=h)
        assert r.status_code == 200
        res = r.json()
        assert res["status"] == "none_found_in_source"
        assert len(res["interactions"]) == 0


def test_check_drug_interactions_network_timeout(client, auth_headers):
    h = auth_headers()
    with patch("httpx.AsyncClient.get") as mock_get:
        async def _mock_timeout(*args, **kwargs):
            raise httpx.TimeoutException("timeout")

        mock_get.side_effect = _mock_timeout

        # Use drug pair not previously cached in test_check_drug_interactions_found
        r = client.post("/api/medicines/check-interactions?drug_names=Ibuprofen&drug_names=Warfarin", headers=h)
        assert r.status_code == 200
        res = r.json()
        assert res["status"] == "could_not_check"
        assert len(res["interactions"]) == 0


def test_supply_tracking_and_refill(client, auth_headers):
    h = auth_headers()
    # 1. Create medicine with supply tracking: 2 pills on hand, threshold 7 days
    payload = {
        "medicine_name": "Lisinopril",
        "dosage": 10,
        "dosage_unit": "mg",
        "form": "TABLET",
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00"],
        "start_date": date.today().isoformat(),
        "quantity_on_hand": 2,
        "pills_per_dose": 1,
        "refill_threshold_days": 7,
    }
    r = client.post("/api/medicines", headers=h, json=payload)
    assert r.status_code == 201
    med = r.json()
    med_id = med["id"]
    assert med["quantity_on_hand"] == 2
    assert med["days_left"] == 2

    # 2. Get schedule entry for today
    sched = client.get(f"/api/medicines/{med_id}/schedule", headers=h).json()
    assert len(sched) > 0
    dose_id = sched[0]["id"]

    # 3. Mark dose taken -> supply should decrement to 1
    r_taken = client.post(f"/api/medicines/{med_id}/schedule/{dose_id}/taken", headers=h)
    assert r_taken.status_code == 200
    taken_data = r_taken.json()
    assert taken_data["is_taken"] is True

    med_after = client.get(f"/api/medicines/{med_id}", headers=h).json()
    assert med_after["quantity_on_hand"] == 1
    assert med_after["days_left"] == 1

    # 4. Check notifications -> low refill reminder was generated
    notifs = client.get("/api/notifications", headers=h).json()
    items = notifs.get("items", [])
    refill_notif = next((n for n in items if "Refill reminder" in n["title"]), None)
    assert refill_notif is not None


    # 5. Undo taken dose (by marking skipped) -> supply restored to 2
    r_skip = client.post(f"/api/medicines/{med_id}/schedule/{dose_id}/skipped", headers=h, json={"reason": "undo"})
    assert r_skip.status_code == 200
    med_restored = client.get(f"/api/medicines/{med_id}", headers=h).json()
    assert med_restored["quantity_on_hand"] == 2

    # 6. Refill action -> add 30 pills
    refill_resp = client.post(f"/api/medicines/{med_id}/refill", headers=h, json={"quantity": 30, "pharmacy_note": "CVS Order #123"})
    assert refill_resp.status_code == 200
    med_refilled = refill_resp.json()
    assert med_refilled["quantity_on_hand"] == 32
    assert med_refilled["pharmacy_note"] == "CVS Order #123"


def test_medicine_scan_endpoint_disabled_and_enabled(client, auth_headers):
    h = auth_headers()
    files = {"image": ("label.jpg", b"fake-image-bytes", "image/jpeg")}

    # Default: FEATURE_MEDICINE_SCAN is False -> returns 404
    r = client.post("/api/medicines/scan", headers=h, files=files)
    assert r.status_code == 404

    # With feature flag enabled but no VISION_API_KEY -> returns 503
    with patch("app.config.settings.settings.FEATURE_MEDICINE_SCAN", True):
        with patch("app.config.settings.settings.VISION_API_KEY", ""):
            r = client.post("/api/medicines/scan", headers=h, files=files)
            assert r.status_code == 503

    # With both enabled -> returns structured draft
    with patch("app.config.settings.settings.FEATURE_MEDICINE_SCAN", True):
        with patch("app.config.settings.settings.VISION_API_KEY", "mock-vision-key"):
            with patch("httpx.AsyncClient.get") as mock_get:
                mock_resp = MagicMock()
                mock_resp.status_code = 200
                mock_resp.json.return_value = {"approximateGroup": {"candidate": [{"name": "Amoxicillin", "rxcui": "723"}]}}

                async def _mock_rx(*args, **kwargs):
                    return mock_resp

                mock_get.side_effect = _mock_rx

                r = client.post("/api/medicines/scan", headers=h, files=files)
                assert r.status_code == 200
                draft = r.json()
                assert draft["medicine_name"] == "Amoxicillin"
                assert draft["form"] == "CAPSULE"
                assert float(draft["dosage"]) == 500.0
