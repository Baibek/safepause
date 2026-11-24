"""Senim Saqshy acceptance scenarios (the task's demo list), end to end through the API."""
import os

os.environ["SAFEPAUSE_LLM"] = "off"
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def fresh():
    client.post("/api/demo/reset", json={})


def transfer(persona="aigul", recipient="new_clean", amount=900000, **kw):
    signals = kw.pop("signals", {})
    return client.post("/api/transfer/check", json={"persona": persona, "recipient_id": recipient, "amount": amount,
                                                    "lang": "kk", "signals": signals, **kw})


def answer_all(tx, reply="no"):
    """Answer every question like a coached victim would: nothing risky admitted."""
    r = {}
    while not r.get("final"):
        q = main.TX[tx]["queue"][0]
        r = client.post("/api/dialog/answer", json={"tx_id": tx, "lang": "kk",
                                                    "answer": "yes" if q == "known" else reply}).json()
    return r


def test_1_call_new_recipient_large_amount_needs_the_trusted_contact_who_refuses():
    r = transfer(signals={"on_call": True, "unknown_caller": True}).json()
    assert r["score"] >= 80 and r["tier"] == "escalate" and r["action"] == "dialog"
    assert {"active_call", "new_recipient"} <= {s["key"] for s in r["signals"]}
    final = answer_all(r["tx_id"])["final"]
    assert final["decision"] == "awaiting_trusted" and final["trusted"] == "Данияр Сейітов"
    note = next(n for n in client.get("/api/guardian/notifications").json() if n["tx_id"] == r["tx_id"])
    assert note["approval"] and note["state"] == "open"
    client.post("/api/guardian/respond", json={"id": note["id"], "action": "stop"})
    assert client.get(f"/api/transfer/{r['tx_id']}").json()["status"] == "cancelled"


def test_1b_silent_trusted_contact_for_24_hours_means_no():
    r = transfer(signals={"on_call": True, "unknown_caller": True}).json()
    answer_all(r["tx_id"])
    client.post("/api/demo/clock", json={"hours": 25})
    assert client.get(f"/api/transfer/{r['tx_id']}").json()["status"] == "cancelled"


def test_1c_without_a_trusted_contact_an_analyst_decides():
    r = transfer(persona="daniyar", amount=500000, signals={"on_call": True, "unknown_caller": True}).json()
    assert r["tier"] == "escalate"
    assert answer_all(r["tx_id"])["final"]["decision"] == "awaiting_analyst"
    client.post("/api/analyst/decide", json={"tx_id": r["tx_id"], "action": "reject", "reason": "client coached"})
    assert client.get(f"/api/transfer/{r['tx_id']}").json()["status"] == "cancelled"


def test_2_call_status_shows_whether_the_bank_is_really_calling():
    assert client.get("/api/callstatus/aigul").json() == {"active": False, "staff": None}
    client.post("/api/callstatus/start", json={"persona": "aigul", "staff_id": "BK-2041"})
    st = client.get("/api/callstatus/aigul").json()
    assert st["active"] and st["staff"]["name"] == "Әсел Нұрланқызы" and st["staff"]["id"] == "BK-2041"
    client.post("/api/callstatus/end", json={"persona": "aigul"})
    assert client.get("/api/callstatus/aigul").json()["active"] is False


def test_3_money_in_the_safe_cannot_be_transferred():
    r = transfer(recipient="family", amount=2_100_000)            # 2 450 000 balance, 400 000 in the safe
    assert r.status_code == 409 and "сейф" in r.json()["detail"]
    assert client.post("/api/protect/unlock", json={"persona": "aigul", "amount": 400000, "channel": "app"}).status_code == 403
    client.post("/api/protect/unlock", json={"persona": "aigul", "amount": 400000, "channel": "atm", "biometric": True})
    assert client.get("/api/protect/aigul").json()["locked"] == 0


def test_4_usual_transfer_to_a_known_recipient_passes_without_friction():
    r = transfer(recipient="family", amount=15000).json()
    assert r["action"] == "approve" and r["tier"] == "pass" and r["score"] < 30


def test_5_check_assistant_flags_a_fake_prize_message():
    r = client.post("/api/message/check", json={
        "lang": "kk", "text": "Kaspi-ден ұтыс! Сіз 500 000 ₸ ұттыңыз, сілтемеге кіріңіз: http://kaspi-bonus.top/prize"}).json()
    assert r["verdict"] == "scam" and r["reasons"]


def test_6_dropper_list_raises_the_next_transfer_to_that_account():
    before = transfer(recipient="new_clean", amount=20000, persona="daniyar").json()
    account = next(x for x in main.RECIPIENTS if x["id"] == "new_clean")["account"]
    client.post("/api/analyst/droplist", json={"account": account, "reason": "many senders, fast cash-out"})
    after = transfer(recipient="new_clean", amount=20000, persona="daniyar").json()
    assert before["score"] < 80 <= after["score"] and after["tier"] == "escalate"
    assert any(s["key"] == "drop_list" for s in after["signals"])


def test_trusted_contact_from_another_bank_is_invited_and_must_consent():
    s = client.post("/api/protect/trusted/invite", json={"persona": "daniyar", "name": "Сәуле Сейітова",
                                                         "phone": "+7 777 123 45 67", "other_bank": True}).json()
    assert s["trusted"]["state"] == "invited" and "45" not in s["trusted"]["phone"]
    assert s["index"] == 0                                      # invited is not yet active
    s = client.post("/api/protect/trusted/accept", json={"persona": "daniyar"}).json()
    assert s["trusted"]["state"] == "active" and s["index"] == 35


def test_first_large_transfer_to_a_new_recipient_waits_even_after_confirmation():
    r = transfer(persona="daniyar", recipient="new_clean", amount=210000).json()
    assert r["action"] == "verify" and r["tier"] == "warn"
    final = client.post("/api/verify/respond", json={"tx_id": r["tx_id"], "answer": "self", "lang": "kk"}).json()["final"]
    assert final["decision"] == "delayed" and final["delay_minutes"] == 30


def test_name_check():
    ok = client.post("/api/recipient/check", json={"recipient_id": "new_clean", "name": "Ержан Қасымов"}).json()
    part = client.post("/api/recipient/check", json={"recipient_id": "new_clean", "name": "Ержан"}).json()
    bad = client.post("/api/recipient/check", json={"recipient_id": "new_clean", "name": "Асхат Нұров"}).json()
    assert (ok["match"], part["match"], bad["match"]) == ("full", "partial", "mismatch")


def test_every_decision_is_in_the_audit_log_without_phone_numbers():
    client.post("/api/protect/trusted/invite", json={"persona": "daniyar", "name": "Сәуле", "phone": "+7 777 123 45 67"})
    transfer(recipient="family", amount=15000)
    log = client.get("/api/audit").json()
    assert {e["action"] for e in log} >= {"trusted_invited", "pass"}
    assert not any("123 45" in e["reason"] for e in log)


def test_pasted_details_and_dictated_typing_are_scored():
    r = transfer(persona="daniyar", recipient="family", amount=20000, signals={"pasted": True, "typing_pause_ms": 5000}).json()
    assert {"pasted_details", "dictated_typing"} <= {s["key"] for s in r["signals"]}


def test_antifraud_center_report_has_no_personal_data():
    r = transfer(signals={"on_call": True, "unknown_caller": True}).json()
    rep = client.post("/api/analyst/report", json={"tx_id": r["tx_id"]}).json()
    text = str(rep)
    assert rep["report_id"].startswith("AFC-") and rep["risk"]["score"] >= 80
    assert "Айгүл" not in text and "Сейітова" not in text and "•••• " in rep["transfer"]["recipient_account"]
    assert main.TX[r["tx_id"]]["reported"] == rep["report_id"]
    assert any(e["action"] == "reported" for e in client.get("/api/audit").json())


def test_behaviour_against_the_clients_usual():
    r = transfer(recipient="family", amount=15000, signals={"app_switches": 2, "typing_median_ms": 1200, "phone_flat": True, "corrections": 7}).json()
    assert {"app_switch", "typing_rhythm", "phone_flat", "corrections"} <= {s["key"] for s in r["signals"]}
    assert main.TX[r["tx_id"]]["behavior"]["typing_baseline_ms"] == 420


def test_graph_flags_droppers_by_itself():
    auto = [d for d in client.get("/api/dashboard").json()["drop_list"] if d.get("auto")]
    assert any(d["account"].endswith("4471") for d in auto) and all(d["fan_in"] >= 3 for d in auto)


def test_many_senders_in_the_last_hour_flag_the_account_live(monkeypatch):
    monkeypatch.setitem(main.saqshy.SEED["senders_last_hour"], "new_clean", 3)
    r = transfer(persona="daniyar", amount=20000).json()
    account = next(x for x in main.RECIPIENTS if x["id"] == "new_clean")["account"]
    entry = main.saqshy.DROP_LIST[account]
    assert entry["auto"] and entry["source"] == "live" and any(s["key"] == "drop_list" for s in r["signals"])
