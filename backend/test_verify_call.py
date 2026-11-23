"""Bank verification call: unusual, suspicious or other-bank transfers are confirmed by the client before they go."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def check(recipient="family", amount=150000, other_bank=False, **signals):
    return client.post("/api/transfer/check", json={"persona": "aigul", "recipient_id": recipient, "amount": amount,
                                                    "lang": "kk", "other_bank": other_bank, "signals": signals}).json()


def respond(tx, answer):
    return client.post("/api/verify/respond", json={"tx_id": tx, "answer": answer, "lang": "kk"})


def test_usual_transfer_goes_without_a_call():
    assert check(amount=15000)["action"] == "approve"


def test_unusual_amount_triggers_the_call_with_the_notice():
    r = check(amount=150000)
    assert r["action"] == "verify"
    assert any("есе көп" in x["kk"] for x in r["verify"]["reasons"])
    assert any("қауіпсіз шотқа" in line for line in r["verify"]["script"])


def test_other_bank_triggers_the_call():
    r = check(recipient="new_clean", amount=60000, other_bank=True)
    assert r["action"] == "verify"
    assert any("басқа банк" in x["kk"] for x in r["verify"]["reasons"])


def test_client_confirms_and_the_transfer_goes():
    tx = check(amount=150000)["tx_id"]
    r = respond(tx, "self").json()
    assert r["final"]["decision"] == "approved" and r["final"]["verified"]
    assert client.get(f"/api/transfer/{tx}").json()["status"] == "approved"


def test_client_says_not_me_and_the_transfer_is_blocked():
    tx = check(amount=150000)["tx_id"]
    assert respond(tx, "not_me").json()["final"]["decision"] == "cancelled"


def test_unanswered_call_postpones_and_tells_the_guardian():
    tx = check(amount=150000)["tx_id"]
    r = respond(tx, "no_answer").json()
    assert r["final"]["decision"] == "delayed" and r["final"]["guardian_notified"]


def test_answer_is_final():
    tx = check(amount=150000)["tx_id"]
    respond(tx, "self")
    assert respond(tx, "not_me").status_code == 404


def test_high_risk_still_goes_to_the_fraud_dialog():
    r = check(recipient="new_drop", amount=1800000, other_bank=True, on_call=True, unknown_caller=True)
    assert r["action"] == "dialog"
