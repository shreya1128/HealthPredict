from app.models import UserRole


def test_admin_users_requires_admin(client, auth_headers):
    assert client.get("/api/admin/users").status_code == 401
    assert client.get("/api/admin/users", headers=auth_headers("u@test.com")).status_code == 403


def test_admin_lists_paginates_and_searches(client, make_user, auth_headers):
    admin = auth_headers("admin@test.com", role=UserRole.ADMIN)
    for i in range(5):
        make_user(email=f"member{i}@test.com", name=f"Member {i}")
    make_user(email="dormant@test.com", name="Dormant Person", active=False)

    r = client.get("/api/admin/users?page_size=3", headers=admin).json()
    assert r["total"] == 7 and len(r["items"]) == 3 and r["page"] == 1
    page3 = client.get("/api/admin/users?page_size=3&page=3", headers=admin).json()
    assert len(page3["items"]) == 1

    found = client.get("/api/admin/users?search=Dormant", headers=admin).json()
    assert found["total"] == 1 and found["items"][0]["email"] == "dormant@test.com"
    inactive = client.get("/api/admin/users?status=inactive", headers=admin).json()
    assert inactive["total"] == 1


def test_admin_list_exposes_no_secrets_or_health_data(client, auth_headers):
    admin = auth_headers("admin@test.com", role=UserRole.ADMIN)
    item = client.get("/api/admin/users", headers=admin).json()["items"][0]
    assert "password_hash" not in item and "weight_kg" not in item and "height_cm" not in item


def test_admin_paging_bounds_validated(client, auth_headers):
    admin = auth_headers("admin@test.com", role=UserRole.ADMIN)
    assert client.get("/api/admin/users?page_size=1000", headers=admin).status_code == 422
    assert client.get("/api/admin/users?page=0", headers=admin).status_code == 422
