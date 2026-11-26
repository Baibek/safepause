"""Server security with SENIM_AUTH on: sessions per role, RBAC, own-data checks, CSRF, rate limits, log masking."""
import logging

import pytest
from fastapi.testclient import TestClient

import main
import security


@pytest.fixture()
def c(monkeypatch):
    monkeypatch.setenv("SENIM_AUTH", "on")
    monkeypatch.delenv("SENIM_STAFF_PASSWORD", raising=False)
    security.LIMITER.reset()
    with TestClient(main.app) as cl:
        main.reset()
        yield cl


def login(c, role, persona=None, password=None):
    r = c.post("/api/auth/login", json={"role": role, "persona": persona, "password": password})
    assert r.status_code == 200, r.text
    return {"X-Senim-Role": role, "X-CSRF-Token": c.cookies.get("senim_csrf")}


def test_anonymous_requests_are_refused(c):
    assert c.get("/api/bootstrap").status_code == 200                     # public
    assert c.get("/api/dashboard").status_code == 401
    assert c.post("/api/transfer/check", json={}).status_code == 401


def test_a_client_cannot_use_analyst_endpoints(c):
    h = login(c, "client", "aigul")
    r = c.get("/api/dashboard", headers={**h, "X-Senim-Role": "client"})
    assert r.status_code == 403
    assert c.get("/api/dashboard", headers={**h, "X-Senim-Role": "analyst"}).status_code == 401   # no analyst session


def test_a_client_sees_only_their_own_data(c):
    h = login(c, "client", "aigul")
    assert c.get("/api/protect/aigul", headers=h).status_code == 200
    assert c.get("/api/protect/daniyar", headers=h).status_code == 403
    r = c.post("/api/protect/lock", json={"persona": "daniyar", "amount": 1}, headers=h)
    assert r.status_code == 403
    assert c.post("/api/protect/lock", json={"persona": "aigul", "amount": 500000}, headers=h).json()["locked"] == 500000


def test_transfer_flow_works_with_a_session_and_csrf(c):
    h = login(c, "client", "daniyar")
    r = c.post("/api/transfer/check", headers=h, json={"persona": "daniyar", "recipient_id": "family", "amount": 15000, "lang": "kk", "signals": {}})
    assert r.status_code == 200 and r.json()["action"] == "approve"
    assert c.get(f"/api/transfer/{r.json()['tx_id']}", headers=h).status_code == 200
    other = login(c, "client", "aigul")
    assert c.get(f"/api/transfer/{r.json()['tx_id']}", headers=other).status_code == 403


def test_missing_or_wrong_csrf_token_is_refused(c):
    h = login(c, "client", "daniyar")
    body = {"persona": "daniyar", "recipient_id": "family", "amount": 15000, "lang": "kk", "signals": {}}
    assert c.post("/api/transfer/check", json=body, headers={"X-Senim-Role": "client"}).status_code == 403
    assert c.post("/api/transfer/check", json=body, headers={**h, "X-CSRF-Token": "forged"}).status_code == 403


def test_forged_session_is_refused(c):
    c.cookies.set("senim_analyst", "eyJyIjoiYW5hbHlzdCJ9.forged")
    assert c.get("/api/dashboard", headers={"X-Senim-Role": "analyst"}).status_code == 401


def test_staff_roles_need_the_password_when_it_is_set(c, monkeypatch):
    monkeypatch.setenv("SENIM_STAFF_PASSWORD", "s3cret-demo")
    assert c.post("/api/auth/login", json={"role": "analyst"}).status_code == 401
    assert c.post("/api/auth/login", json={"role": "analyst", "password": "nope"}).status_code == 401
    login(c, "analyst", password="s3cret-demo")
    assert c.get("/api/dashboard", headers={"X-Senim-Role": "analyst"}).status_code == 200


def test_only_staff_open_the_safe_and_only_admin_moves_the_clock(c):
    h = login(c, "client", "aigul")
    assert c.post("/api/protect/unlock", json={"persona": "aigul", "amount": 1, "channel": "atm", "biometric": True}, headers=h).status_code == 403
    s = login(c, "staff")
    assert c.post("/api/protect/unlock", json={"persona": "aigul", "amount": 1, "channel": "atm", "biometric": True}, headers=s).status_code == 200
    assert c.post("/api/demo/clock", json={"hours": 1}, headers=s).status_code == 403


def test_login_is_rate_limited(c):
    codes = [c.post("/api/auth/login", json={"role": "client", "persona": "aigul"}).status_code for _ in range(32)]
    assert codes[:30] == [200] * 30 and codes[-1] == 429


def test_security_headers(c):
    r = c.get("/api/bootstrap")
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"


def test_logs_and_audit_mask_personal_data(c, caplog):
    assert security.mask("call +7 701 123 45 67, card 4405 1234 5678 4471, iban KZ31 1234 5678 9012 2208") == \
        "call +7 ••• ••• •• ••, card 4405 •••• ••••, iban KZ31 ••••"
    logging.getLogger("uvicorn.access").addFilter(security.MaskFilter())
    with caplog.at_level(logging.INFO, logger="uvicorn.access"):
        logging.getLogger("uvicorn.access").info("client %s paid", "4405 1234 5678 4471")
    assert "1234 5678" not in caplog.text
