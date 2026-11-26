"""Everyday banking for the demo phone: products, past operations, utility payments and QR purchases.

All of it is synthetic (shared/bank_seed.json). The browser engine mirrors it in frontend/src/virtual/bank.js.
Payments and purchases go to known providers and shops, so they skip the transfer risk check; transfers to
people still go through /api/transfer/check and show up here once they exist.
"""
import json
import uuid
from datetime import timedelta
from pathlib import Path

SEED = json.loads((Path(__file__).resolve().parent.parent / "shared" / "bank_seed.json").read_text(encoding="utf-8"))
PAYMENTS: dict[str, list] = {}   # persona id -> operations made in this demo session


def reset():
    PAYMENTS.clear()


def _seed_ops(pid, now):
    ops = []
    for i, o in enumerate(SEED["clients"].get(pid, {}).get("operations", [])):
        hh, mm = (int(x) for x in o["time"].split(":"))
        when = (now - timedelta(days=o["days_ago"])).replace(hour=hh, minute=mm, second=0, microsecond=0)
        ops.append({"id": f"seed-{pid}-{i}", "time": when.isoformat(timespec="seconds"), "category": o["category"],
                    "title": o["title"], "amount": o["amount"], "status": "done"})
    return ops


def _transfer_ops(txs, names):
    return [{"id": t["id"], "time": t["time"], "category": "transfer_out", "title": names.get(t["recipient"], t["recipient"]),
             "amount": -t["amount"], "status": t["status"], "tx": True} for t in txs]


def state(persona, locked, txs, names, now):
    """Products, balance and operations of one client. `txs` are the client's live transfers."""
    pid = persona["id"]
    c = SEED["clients"].get(pid, {})
    mine = PAYMENTS.get(pid, [])
    sent = sum(t["amount"] for t in txs if t["status"] == "approved")
    paid = sum(-o["amount"] for o in mine)
    balance = persona["balance"] - sent - paid
    ops = sorted(_seed_ops(pid, now) + mine + _transfer_ops(txs, names), key=lambda o: o["time"], reverse=True)
    month_ago = (now - timedelta(days=30)).isoformat(timespec="seconds")
    spend = {}
    for o in ops:
        if o["amount"] < 0 and o["time"] >= month_ago and o.get("status") in ("done", "approved"):
            spend[o["category"]] = spend.get(o["category"], 0) + -o["amount"]
    return {"persona": pid, "card": c.get("card"), "balance": balance, "available": balance - locked, "locked": locked,
            "cashback": c.get("cashback", 0) + sum(o.get("cashback", 0) for o in mine),
            "deposits": c.get("deposits", []), "accounts": c.get("accounts", []),
            "spend": spend, "operations": ops}


def catalogue():
    return {"categories": SEED["categories"], "payments": SEED["payments"], "shops": SEED["shops"],
            "cashback_rates": SEED["cashback_rates"]}


def pay(pid, available, kind, amount, now, category=None, provider=None, account=None, shop=None):
    """A utility payment (kind 'payment') or a QR purchase in a shop (kind 'purchase'). Returns the operation,
    or raises ValueError with the reason."""
    amount = round(float(amount or 0))
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > available:
        raise ValueError("not enough money")
    if kind == "payment":
        group = next((p for p in SEED["payments"] if p["category"] == category), None)
        if not group or provider not in group["providers"]:
            raise ValueError("unknown provider")
        if len(str(account or "").strip()) < 3:
            raise ValueError("account is required")
        op = {"category": category, "title": provider, "account": str(account).strip()[-4:]}
    elif kind == "purchase":
        s = next((x for x in SEED["shops"] if x["id"] == shop), None)
        if not s:
            raise ValueError("unknown shop")
        op = {"category": s["category"], "title": s["name"]}
    else:
        raise ValueError("unknown kind")
    rate = SEED["cashback_rates"].get(op["category"], 0)
    op.update({"id": "op-" + uuid.uuid4().hex[:8], "time": now.isoformat(timespec="seconds"), "amount": -amount,
               "status": "done", "kind": kind, "cashback": round(amount * rate)})
    PAYMENTS.setdefault(pid, []).append(op)
    return op
