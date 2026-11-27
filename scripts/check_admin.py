import hashlib
import hmac
import importlib.util
import json
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
TEST_BOT_TOKEN = "isolated-regression-test-token"


def signed_init_data(user_id: int, first_name: str) -> str:
    payload = {
        "auth_date": str(int(time.time())),
        "user": json.dumps({"id": user_id, "first_name": first_name}, separators=(",", ":")),
    }
    check_string = "\n".join(f"{key}={value}" for key, value in sorted(payload.items()))
    secret_key = hmac.new(b"WebAppData", TEST_BOT_TOKEN.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


with tempfile.TemporaryDirectory() as tmp:
    os.environ.update(
        DATABASE_PATH=str(Path(tmp) / "test.db"),
        BOT_TOKEN=TEST_BOT_TOKEN,
        ADMIN_TG_IDS="100000001",
        JWT_SECRET="isolated-regression-secret-not-production-48chars",
    )
    spec = importlib.util.spec_from_file_location("cg_backend_test", ROOT / "backend" / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with TestClient(module.app) as client:
        admin_response = client.post("/api/auth/telegram", json={"init_data": signed_init_data(100000001, "Admin")})
        user_response = client.post("/api/auth/telegram", json={"init_data": signed_init_data(100000002, "User")})
        assert admin_response.status_code == 200, admin_response.text
        assert user_response.status_code == 200, user_response.text
        admin = admin_response.json()
        user = user_response.json()
        admin_headers = {"Authorization": "Bearer " + admin["access_token"]}
        user_headers = {"Authorization": "Bearer " + user["access_token"]}

        def balance():
            return client.get("/api/me", headers=user_headers).json()["user"]["balance"]

        before = balance()
        assert client.post("/api/admin/users/100000002/balance", json={"amount": 1000}, headers=admin_headers).status_code == 200
        assert balance() == before + 1000
        assert client.post("/api/admin/users/100000002/balance", json={"amount": -400}, headers=admin_headers).status_code == 200
        assert balance() == before + 600
        assert client.post("/api/admin/users/100000001/gift", json={"gift_id": "durovscap-1"}, headers=admin_headers).status_code == 200
        assert any(x["gift_id"] == "durovscap-1" for x in client.get("/api/me", headers=admin_headers).json()["inventory"])
        assert client.post("/api/admin/users/100000002/balance", json={"amount": 1000}, headers=user_headers).status_code == 403
        assert client.post("/api/admin/users/100000001/gift", json={"gift_id": "durovscap-1"}, headers=user_headers).status_code == 403
        assert client.post("/api/admin/users/999/balance", json={"amount": 1000}, headers=admin_headers).status_code == 404
        assert len(client.get("/api/admin/users?q=100000002", headers=admin_headers).json()) == 1
        with module.connect() as con:
            assert con.execute("SELECT count(*) FROM action_logs").fetchone()[0] >= 3
        assert client.get("/health").json()["ok"] is True
    print("PASS: signed Telegram auth, admin permissions, credit/debit, NFT grant, search, audit log, health; isolated temporary DB.")
