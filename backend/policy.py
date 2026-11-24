"""Senim Saqshy risk policy: signals -> 0-100 score -> tier (pass / warn / cool / escalate), with an explanation.

All numbers live in shared/risk_policy.json. frontend/src/virtual/policy.js is the same function for the browser;
shared/policy_cases.json is checked against both.

facts: amount, amount_ratio (amount / the client's usual transfer), hour, model_risk (0..1), new_recipient, other_bank,
new_device, on_call, unknown_caller, scam_call_minutes, remote_access, rooted, vpn, drop_list, senders_last_hour,
loan_minutes_ago, name_match ("full" | "partial" | "mismatch"), pasted (recipient details pasted from the
clipboard), typing_pause_ms (longest pause while typing the amount), app_switches (times the app was left during
the transfer), typing_median_ms / typing_baseline_ms (this typing rhythm vs the client's usual), phone_flat, corrections.
"""
import json
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parent.parent / "shared" / "risk_policy.json").read_text(encoding="utf-8"))
ORDER = list(POLICY["signals"])


def _hits(f):
    """(key, points, {placeholders}) for every signal present in the facts."""
    S = POLICY["signals"]
    out = []
    risk = float(f.get("model_risk") or 0)
    if round(S["model"]["weight"] * risk) > 0:
        out.append(("model", round(S["model"]["weight"] * risk), {}))
    m = f.get("scam_call_minutes")
    if m is not None and 0 <= m <= S["scam_call"]["window_min"]:
        out.append(("scam_call", S["scam_call"]["points"], {}))
    if f.get("drop_list"):
        out.append(("drop_list", S["drop_list"]["points"], {}))
    loan = f.get("loan_minutes_ago")
    if f.get("new_device") and loan is not None and 0 <= loan <= S["loan_new_device"]["window_min"]:
        out.append(("loan_new_device", S["loan_new_device"]["points"], {}))
    if f.get("remote_access"):
        out.append(("remote_access", S["remote_access"]["points"], {}))
    ratio = float(f.get("amount_ratio") or 0)
    if ratio >= S["amount_extreme"]["ratio"]:
        out.append(("amount_extreme", S["amount_extreme"]["points"], {"r": round(ratio)}))
    elif ratio >= S["amount_unusual"]["ratio"]:
        out.append(("amount_unusual", S["amount_unusual"]["points"], {"r": round(ratio)}))
    if f.get("other_bank") and (f.get("amount") or 0) >= S["other_bank"]["min_amount"]:
        out.append(("other_bank", S["other_bank"]["points"], {}))
    n = f.get("senders_last_hour") or 0
    if n >= S["fan_in"]["senders"]:
        out.append(("fan_in", S["fan_in"]["points"], {"n": n}))
    if f.get("name_match") == "mismatch":
        out.append(("name_mismatch", S["name_mismatch"]["points"], {}))
    if f.get("on_call"):
        out.append(("active_call", S["active_call"]["points"], {}))
    if f.get("new_device"):
        out.append(("new_device", S["new_device"]["points"], {}))
    if f.get("rooted"):
        out.append(("rooted", S["rooted"]["points"], {}))
    if f.get("on_call") and f.get("unknown_caller"):
        out.append(("unknown_caller", S["unknown_caller"]["points"], {}))
    if f.get("new_recipient"):
        out.append(("new_recipient", S["new_recipient"]["points"], {}))
    if f.get("name_match") == "partial":
        out.append(("name_partial", S["name_partial"]["points"], {}))
    if f.get("pasted"):
        out.append(("pasted_details", S["pasted_details"]["points"], {}))
    if (f.get("typing_pause_ms") or 0) >= S["dictated_typing"]["pause_ms"]:
        out.append(("dictated_typing", S["dictated_typing"]["points"], {}))
    n = f.get("app_switches") or 0
    if n > 0:
        out.append(("app_switch", S["app_switch"]["points"], {"n": n}))
    med, base = f.get("typing_median_ms"), f.get("typing_baseline_ms")
    if med and base:
        k = max(med / base, base / med)
        if k >= S["typing_rhythm"]["ratio"]:
            out.append(("typing_rhythm", S["typing_rhythm"]["points"], {"r": f"{k:.1f}"}))
    if f.get("phone_flat"):
        out.append(("phone_flat", S["phone_flat"]["points"], {}))
    if (f.get("corrections") or 0) >= S["corrections"]["count"]:
        out.append(("corrections", S["corrections"]["points"], {}))
    hour = f.get("hour")
    if hour is not None and S["night"]["from_hour"] <= hour < S["night"]["to_hour"]:
        out.append(("night", S["night"]["points"], {}))
    if f.get("vpn"):
        out.append(("vpn", S["vpn"]["points"], {}))
    return out


def evaluate(f):
    S, T, C = POLICY["signals"], POLICY["thresholds"], POLICY["cooling"]
    hits = sorted(_hits(f), key=lambda h: (-h[1], ORDER.index(h[0])))
    score = min(100, sum(p for _, p, _ in hits))
    for key, _, _ in hits:
        score = max(score, S[key].get("min_score", 0))
    tier = ("escalate" if score >= T["escalate"] else "cool" if score >= T["cool"]
            else "warn" if score >= T["warn"] else "pass")
    keys = {k for k, _, _ in hits}
    cooling = None
    if tier == "cool":
        cooling = {"minutes": C["cool_minutes"], "reason": "cool"}
    if tier != "escalate":
        if "loan_new_device" in keys:
            cooling = {"minutes": max(C["loan_new_device_minutes"], (cooling or {}).get("minutes", 0)), "reason": "loan_new_device"}
        elif tier in ("pass", "warn") and "new_recipient" in keys and (f.get("amount") or 0) >= C["new_recipient_min_amount"]:
            cooling = {"minutes": C["new_recipient_minutes"], "reason": "new_recipient"}
    signals = [{"key": k, "points": p,
                "kk": S[k]["kk"].replace("{r}", str(v.get("r", ""))).replace("{n}", str(v.get("n", ""))),
                "ru": S[k]["ru"].replace("{r}", str(v.get("r", ""))).replace("{n}", str(v.get("n", "")))}
               for k, p, v in hits]
    return {"score": score, "tier": tier, "signals": signals, "cooling": cooling}
