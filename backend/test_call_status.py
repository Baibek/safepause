"""Call Status must not vouch for a scammer who calls while a real bank session happens to be open."""
import os
from urllib.parse import quote

os.environ["SAFEPAUSE_LLM"] = "off"
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import saqshy  # noqa: E402

client = TestClient(main.app)
LINE = saqshy.SEED["call_status"]["bank_line"]


@pytest.fixture(autouse=True)
def fresh():
    client.post("/api/demo/reset", json={})


def status(line=None):
    return client.get("/api/callstatus/aigul" + (f"?line={quote(line)}" if line else "")).json()


def test_the_bank_on_its_own_line_is_the_bank():
    client.post("/api/callstatus/start", json={"persona": "aigul", "staff_id": "BK-2041"})
    r = status(LINE)
    assert r["active"] and r["staff"]["id"] == "BK-2041"


def test_a_scammer_on_another_number_is_not_the_bank_even_with_a_session_open():
    client.post("/api/callstatus/start", json={"persona": "aigul", "staff_id": "BK-2041"})
    r = status("+7 727 355 •• 14")
    assert r == {"active": False, "staff": None, "mismatch": True, "line": LINE}
    assert status("whatsapp")["active"] is False


def test_asking_from_the_app_without_a_number_still_sees_the_session():
    client.post("/api/callstatus/start", json={"persona": "aigul"})
    assert status()["active"] is True


def test_a_forgotten_session_closes_by_itself():
    client.post("/api/callstatus/start", json={"persona": "aigul"})
    client.post("/api/demo/clock", json={"hours": 1})
    assert status(LINE) == {"active": False, "staff": None}
    assert any(a["action"] == "call_ended" and a["reason"] == "expired" for a in saqshy.AUDIT)
