"""Senim Saqshy risk policy: every case in shared/policy_cases.json, plus the rules that hold for any input."""
import json
from pathlib import Path

import pytest

import policy

CASES = json.loads((Path(__file__).resolve().parent.parent / "shared" / "policy_cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_policy_case(case):
    r = policy.evaluate(case["facts"])
    assert r["score"] == case["expect"]["score"]
    assert r["tier"] == case["expect"]["tier"]
    assert [s["key"] for s in r["signals"]] == case["expect"]["signals"]
    assert r["cooling"] == case["expect"]["cooling"]


def test_every_signal_is_explained_in_both_languages():
    r = policy.evaluate({"amount": 1800000, "amount_ratio": 12, "hour": 3, "on_call": True, "unknown_caller": True,
                         "new_recipient": True, "model_risk": 0.9, "drop_list": True, "senders_last_hour": 6})
    for s in r["signals"]:
        assert s["points"] > 0 and s["kk"] and s["ru"] and "{" not in s["kk"] + s["ru"]


def test_score_is_capped_at_100():
    r = policy.evaluate({"amount": 10**7, "amount_ratio": 500, "model_risk": 1, "on_call": True, "remote_access": True,
                         "drop_list": True, "scam_call_minutes": 1, "new_recipient": True})
    assert r["score"] == 100


def test_thresholds_come_from_the_config(monkeypatch):
    monkeypatch.setitem(policy.POLICY["thresholds"], "warn", 50)
    assert policy.evaluate({"amount": 150000, "amount_ratio": 8.3})["tier"] == "pass"
