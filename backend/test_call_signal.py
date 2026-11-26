"""A scam call detected on the client's phone shortly before a transfer must pause that transfer."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def check(**signals):
    return client.post("/api/transfer/check", json={
        "persona": "daniyar", "recipient_id": "family", "amount": 20000, "lang": "kk", "signals": signals}).json()


def test_ordinary_transfer_to_family_passes():
    assert check()["action"] == "approve"


def test_recent_scam_call_pauses_even_a_small_transfer_to_family():
    r = check(scam_call_minutes=5)
    assert r["action"] == "dialog"
    assert r["level"] == "high"
    assert r["factors"][0]["key"] == "scam_call"
    assert r["question"]["key"] == "call"


def test_scam_call_older_than_an_hour_is_ignored():
    assert check(scam_call_minutes=90)["action"] == "approve"


def test_dashboard_marks_transfers_after_a_scam_call():
    tx_id = check(scam_call_minutes=3)["tx_id"]
    tx = next(t for t in client.get("/api/dashboard").json()["transactions"] if t["id"] == tx_id)
    assert tx["scam_call"] is True
