"""Senim Saqshy server security: sessions per role, RBAC from shared/access_policy.json, CSRF, rate limits,
security headers and masking of personal data in logs. Standard library only.

Sessions: one signed, HttpOnly, SameSite=Strict cookie per role (senim_client, senim_analyst, ...), so the demo can
hold a client and an analyst session at once; each request names the role it acts as in X-Senim-Role, and the
server checks that this role may call the path and, for a client or trusted contact, that the persona is their own.
CSRF: a double-submit token (cookie senim_csrf, header X-CSRF-Token) on every state-changing request.
Settings come from the environment (.env): SENIM_AUTH=off disables the checks (tests, local hacking),
SENIM_SECRET signs sessions, SENIM_STAFF_PASSWORD guards the staff, analyst and admin roles.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parent.parent / "shared" / "access_policy.json").read_text(encoding="utf-8"))
RULES = [dict(r, rx=re.compile(r["path"])) for r in POLICY["rules"]]
ROLES = {"client", "trusted", "staff", "analyst", "admin"}
SESSION_HOURS = 8
_SECRET = (os.getenv("SENIM_SECRET") or secrets.token_hex(32)).encode()


def enabled():
    return os.getenv("SENIM_AUTH", "on") != "off"


def staff_password():
    return os.getenv("SENIM_STAFF_PASSWORD") or None


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(role, persona=None):
    payload = _b64(json.dumps({"r": role, "p": persona, "e": int(time.time()) + SESSION_HOURS * 3600,
                               "n": secrets.token_hex(4)}).encode())
    mac = _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{mac}"


def verify(token):
    """The session payload if the token is genuine and not expired, else None."""
    if not token or token.count(".") != 1:
        return None
    payload, mac = token.split(".")
    if not hmac.compare_digest(mac, _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        return None
    return data if data.get("e", 0) > time.time() and data.get("r") in ROLES else None


def rule_for(method, path):
    return next((r for r in RULES if r["method"] == method and r["rx"].search(path)), None)


class RateLimiter:
    """Requests per minute per client address and path group; returns seconds to wait when over the limit."""
    def __init__(self, limits):
        self.limits = [(re.compile(k), v) for k, v in limits.items() if k != "default"]
        self.default = limits.get("default", 240)
        self.hits = defaultdict(deque)

    def hit(self, ip, path, now=None):
        now = now if now is not None else time.monotonic()
        key, limit = next(((rx.pattern, n) for rx, n in self.limits if rx.search(path)), ("default", self.default))
        q = self.hits[(ip, key)]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(60 - (now - q[0])) + 1)
        q.append(now)
        return None

    def reset(self):
        self.hits.clear()


LIMITER = RateLimiter(POLICY["rate_limits"])

# ---------------------------------------------------------------- personal data never reaches the logs
_MASKS = [
    (re.compile(r"\bKZ\d{2}(?:[ ]?[A-Z0-9]){14,18}\b", re.I), lambda m: m.group()[:4] + " ••••"),
    (re.compile(r"\b(?:\d[ -]?){15}\d\b"), lambda m: re.sub(r"\D", "", m.group())[:4] + " •••• ••••"),
    (re.compile(r"(?:\+7|\b8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b"), lambda m: "+7 ••• ••• •• ••"),
]


def mask(text):
    for rx, repl in _MASKS:
        text = rx.sub(repl, text)
    return text


class MaskFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = mask(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(mask(a) if isinstance(a, str) else a for a in record.args)
        return True


def install_log_masking():
    for name in ("", "uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging.getLogger(name).addFilter(MaskFilter())


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=(self)",
}
