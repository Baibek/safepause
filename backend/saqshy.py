"""Senim Saqshy: the client's protection settings and the bank-side state around them.

Money lock (safe), trusted contact, Call Status sessions of bank staff, the analysts' dropper list, the name check,
the security index and the audit log. Everything is in memory and comes back to shared/seed_saqshy.json on reset;
this is a demo, not a bank system. backend/main.py owns transfers and calls into this module.
"""
import copy
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = json.loads((Path(__file__).resolve().parent.parent / "shared" / "seed_saqshy.json").read_text(encoding="utf-8"))
ALMATY = timezone(timedelta(hours=5))
INDEX_POINTS = {"passkey": 35, "trusted": 35, "locked": 30}   # security index 0..100

CLIENTS, SESSIONS, DROP_LIST, AUDIT = {}, {}, {}, []
CLOCK = {"offset_hours": 0.0}   # the demo can move time forward to show the 24-hour trusted-contact timeout


def reset():
    CLIENTS.clear(); SESSIONS.clear(); DROP_LIST.clear(); AUDIT.clear()
    CLOCK["offset_hours"] = 0.0
    CLIENTS.update(copy.deepcopy(SEED["clients"]))


def now():
    return datetime.now(ALMATY) + timedelta(hours=CLOCK["offset_hours"])


def now_iso():
    return now().isoformat(timespec="seconds")


def mask_phone(p):
    digits = re.sub(r"\D", "", p or "")
    return f"+7 ••• ••• {digits[-2:]}" if len(digits) >= 2 else "•••"


def audit(actor, role, action, target, reason=""):
    """Every decision, who made it and why. Phone numbers never reach the log."""
    AUDIT.insert(0, {"time": now_iso(), "actor": actor, "role": role, "action": action, "target": target,
                     "reason": re.sub(r"\+?\d[\d\s()-]{8,}\d", lambda m: mask_phone(m.group()), reason)})


# ---------------------------------------------------------------- protection settings
def client(pid):
    return CLIENTS.setdefault(pid, {"locked": 0, "passkey": False, "trusted": None})


def security_index(c):
    trusted = bool(c.get("trusted")) and (c["trusted"] is True or c["trusted"].get("state") == "active")
    return (INDEX_POINTS["passkey"] * bool(c.get("passkey")) + INDEX_POINTS["trusted"] * trusted
            + INDEX_POINTS["locked"] * bool(c.get("locked")))


def trusted_active(pid):
    t = client(pid).get("trusted")
    return t if t and t.get("state") == "active" else None


def available(pid, balance):
    return balance - client(pid)["locked"]


def adoption():
    """Share of all clients (demo and background) that switched each protection on."""
    rows = [{"trusted": bool(trusted_active(pid)), "locked": bool(c["locked"]), "passkey": c["passkey"]}
            for pid, c in CLIENTS.items()]
    rows += [{"trusted": b["trusted"], "locked": bool(b["locked"]), "passkey": b["passkey"]} for b in SEED["background"]]
    n = len(rows)
    return {k: round(sum(r[k] for r in rows) / n, 3) for k in ("trusted", "locked", "passkey")} | {"clients": n}


# ---------------------------------------------------------------- name check
def _norm(s):
    return re.sub(r"[^a-zа-яёәғқңөұүһі ]", "", (s or "").lower()).split()


def name_check(recipient_id, typed):
    owner = SEED["owners"].get(recipient_id)
    if not owner or not typed.strip():
        return None
    o, t = _norm(owner), _norm(typed)
    if set(t) == set(o):
        match = "full"
    elif set(t) & set(o):
        match = "partial"
    else:
        match = "mismatch"
    masked = " ".join(w[0].upper() + "•" * (len(w) - 1) for w in o)
    return {"match": match, "owner_masked": masked}


# ---------------------------------------------------------------- Call Status
def staff(staff_id):
    return next((s for s in SEED["staff"] if s["id"] == staff_id), None)


reset()
