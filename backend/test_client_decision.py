"""The fraud-warning screen lets the client cancel or postpone a paused transfer without answering the questions."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def paused(persona="aigul", amount=1800000):
    r = client.post("/api/transfer/check", json={"persona": persona, "recipient_id": "new_drop", "amount": amount,
                                                 "lang": "kk", "signals": {"on_call": True, "unknown_caller": True}}).json()
    assert r["action"] == "dialog"
    return r["tx_id"]


def answer(tx, value):
    return client.post("/api/dialog/answer", json={"tx_id": tx, "answer": value, "lang": "kk"})


def test_cancel_from_warning_screen_cancels():
    r = answer(paused(), "cancel").json()
    assert r["final"]["decision"] == "cancelled"


def test_delay_from_warning_screen_postpones_for_an_hour_on_high_risk():
    r = answer(paused(), "delay").json()
    assert r["final"]["decision"] == "delayed"
    assert r["final"]["delay_minutes"] == 60


def test_delay_notifies_the_guardian_of_an_older_client():
    tx = paused()
    r = answer(tx, "delay").json()
    assert r["final"]["guardian_notified"] is True
    assert any(n["tx_id"] == tx and n["state"] == "open" for n in client.get("/api/guardian/notifications").json())


def test_decision_is_final():
    tx = paused()
    answer(tx, "cancel")
    assert answer(tx, "no").status_code == 404
