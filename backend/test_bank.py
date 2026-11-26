"""Everyday banking on the demo phone: products, operations, payments and QR purchases."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def fresh():
    client.post("/api/demo/reset", json={})


def test_state_has_products_and_operations_newest_first():
    b = client.get("/api/bank/aigul").json()
    assert b["card"]["last4"] == "4417" and b["deposits"] and b["operations"]
    times = [o["time"] for o in b["operations"]]
    assert times == sorted(times, reverse=True)
    assert b["available"] == b["balance"] - b["locked"]
    assert b["spend"]["grocery"] > 0


def test_utility_payment_lowers_balance_and_is_listed():
    before = client.get("/api/bank/aigul").json()
    r = client.post("/api/bank/pay", json={"persona": "aigul", "kind": "payment", "category": "utilities",
                                           "provider": "Тазасу · су", "account": "000123456", "amount": 4200}).json()
    assert r["operation"]["amount"] == -4200 and r["operation"]["account"] == "3456"
    assert r["bank"]["balance"] == before["balance"] - 4200
    assert r["bank"]["operations"][0]["id"] == r["operation"]["id"]


def test_qr_purchase_earns_cashback():
    before = client.get("/api/bank/daniyar").json()["cashback"]
    r = client.post("/api/bank/pay", json={"persona": "daniyar", "kind": "purchase", "shop": "bereke", "amount": 10000}).json()
    assert r["operation"]["category"] == "grocery" and r["operation"]["cashback"] == 500
    assert r["bank"]["cashback"] == before + 500


@pytest.mark.parametrize("body", [
    {"kind": "payment", "category": "utilities", "provider": "Белгісіз", "account": "123456", "amount": 100},
    {"kind": "payment", "category": "mobile", "provider": "Дала Мобайл", "account": "", "amount": 100},
    {"kind": "purchase", "shop": "nope", "amount": 100},
    {"kind": "purchase", "shop": "bereke", "amount": 0},
    {"kind": "purchase", "shop": "bereke", "amount": 99_000_000},
])
def test_bad_payments_are_refused(body):
    assert client.post("/api/bank/pay", json={"persona": "aigul", **body}).status_code == 400


def test_money_in_the_safe_cannot_be_spent():
    b = client.get("/api/bank/aigul").json()
    assert b["locked"] > 0
    r = client.post("/api/bank/pay", json={"persona": "aigul", "kind": "purchase", "shop": "qala", "amount": b["available"] + 1})
    assert r.status_code == 400


def test_approved_transfer_appears_and_reduces_balance():
    before = client.get("/api/bank/aigul").json()["balance"]
    tx = client.post("/api/transfer/check", json={"persona": "aigul", "recipient_id": "family", "amount": 15000,
                                                  "signals": {}}).json()
    assert tx["action"] == "approve"
    b = client.get("/api/bank/aigul").json()
    assert b["balance"] == before - 15000
    top = b["operations"][0]
    assert top["category"] == "transfer_out" and top["amount"] == -15000 and top["title"]["kk"].startswith("Мадина")


def test_reset_clears_payments():
    client.post("/api/bank/pay", json={"persona": "aigul", "kind": "purchase", "shop": "dan", "amount": 1500})
    client.post("/api/demo/reset", json={})
    assert not any(o.get("kind") for o in client.get("/api/bank/aigul").json()["operations"])
