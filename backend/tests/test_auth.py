import uuid

def test_register_and_login(client):
    unique_email = f"citizen.{uuid.uuid4().hex[:6]}@test.com"
    # 1. Register citizen
    reg_res = client.post("/api/auth/register", json={
        "name": "Test Citizen",
        "email": unique_email,
        "password": "Password@123",
        "phone": "+91-9999900000",
        "role": "citizen"
    })
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == unique_email
    assert reg_data["user"]["role"] == "citizen"

    # 2. Login
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "Password@123"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    token = login_data["access_token"]
    assert token is not None

    # 3. Check /me with token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["name"] == "Test Citizen"

def test_admin_authority_login(client):
    # Test seeded admin login
    res = client.post("/api/auth/login", json={
        "email": "admin@bengaluru.gov.in",
        "password": "Admin@123"
    })
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "admin"
