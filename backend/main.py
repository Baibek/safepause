"""Senim API: real-time transfer scoring, AI dialog, guardian mode, analyst dashboard."""
import json
import math
import random
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import graph as graph_mod
import llm
import policy
import saqshy
import webauthn
from features import FEATURES, build_features

HERE = Path(__file__).parent
ALMATY = timezone(timedelta(hours=5))
PAUSE_AT, HIGH_AT = 0.25, 0.60
GUARDIAN_MIN_AMOUNT = 100_000
SCAM_CALL_WINDOW_MIN = 60   # a transfer within an hour of a detected scam call is always paused

if not (HERE / "model.json").exists():
    import train
    train.main()
booster = xgb.Booster()
booster.load_model(HERE / "model.json")
METRICS = json.loads((HERE / "metrics.json").read_text())
GRAPH = graph_mod.build()
DROP = {n["id"]: n for n in GRAPH["nodes"] if n["role"] in ("drop", "cashout")}

# ---------------------------------------------------------------- demo data
PERSONAS = {
    "aigul": {
        "id": "aigul", "name": "Айгүл Сейітова", "age": 68, "balance": 2_450_000, "avg_amount": 18_000,
        "guardian": {"name": "Данияр", "relation": {"kk": "ұлы", "ru": "сын"}},
    },
    "daniyar": {
        "id": "daniyar", "name": "Данияр Сейітов", "age": 29, "balance": 780_000, "avg_amount": 35_000,
        "guardian": None,
    },
}
RECIPIENTS = [
    {"id": "family", "name": {"kk": "Мадина (қызым)", "ru": "Мадина (дочь)"}, "account": "KZ12 •••• 7730",
     "known": True, "age_days": 1500},
    {"id": "utility", "name": {"kk": "Коммуналдық төлем", "ru": "Коммунальные услуги"}, "account": "KZ55 •••• 0102",
     "known": True, "age_days": 3000},
    {"id": "new_clean", "name": {"kk": "Жаңа алушы — Ержан Қ.", "ru": "Новый получатель — Ержан К."},
     "account": "KZ31 •••• 2208", "known": False, "age_days": 420},
    {"id": "new_drop", "name": {"kk": "Жаңа алушы — «қауіпсіз шот»", "ru": "Новый получатель — «безопасный счёт»"},
     "account": graph_mod.DEMO_DROP_ACCOUNT, "known": False, "age_days": DROP[graph_mod.DEMO_DROP_ACCOUNT]["age_days"]},
]

# ---------------------------------------------------------------- texts (kk / ru)
FACTOR = {
    "amount": ("Ірі сома", "Крупная сумма", "large amount"),
    "amount_ratio": ("Сома әдеттегі аудармаларыңыздан {v:.0f} есе көп", "Сумма в {v:.0f} раз больше ваших обычных переводов",
                     "amount is {v:.0f}x the client's usual transfer"),
    "drain_ratio": ("Аударма шоттағы ақшаның {p:.0f}%-ын алып кетеді", "Перевод забирает {p:.0f}% денег со счёта",
                    "transfer drains {p:.0f}% of the balance"),
    "new_recipient": ("Алушы жаңа — бұрын оған аударма жасамағансыз", "Получатель новый — раньше вы ему не переводили",
                      "recipient is new for this client"),
    "hour": ("Әдеттен тыс уақыт — {h}:00", "Необычное время — {h}:00", "unusual hour {h}:00"),
    "is_night": ("Түнгі уақыт — {h}:00", "Ночное время — {h}:00", "night time {h}:00"),
    "on_call": ("Аударма кезінде телефон қоңырауы жүріп жатыр", "Во время перевода идёт телефонный звонок",
                "a phone call is in progress during the transfer"),
    "unknown_caller": ("Қоңырау бейтаныс нөмірден", "Звонок с незнакомого номера", "the caller is not in contacts"),
    "remote_app": ("Қашықтан басқару қолданбасы қосулы (AnyDesk / RustDesk)",
                   "Включено приложение удалённого доступа (AnyDesk / RustDesk)", "remote-access app is active"),
    "session_dev": ("Әрекет қарқыны әдеттегіден өзгеше", "Темп действий отличается от обычного",
                    "unusually fast or slow behaviour in the app"),
    "client_age": ("Тәуекелі жоғары жас тобы", "Возрастная группа повышенного риска", "age group at higher risk"),
    "recipient_age_days": ("Алушының шоты жақында ашылған ({d:.0f} күн)", "Счёт получателя открыт недавно ({d:.0f} дн.)",
                           "recipient account is only {d:.0f} days old"),
    "recipient_drop_score": ("Алушы шоты дроп-желіге байланысты", "Счёт получателя связан с сетью дропов",
                             "recipient account is linked to a money-mule network"),
    "tx_24h": ("Тәулік ішінде аударма көп", "Много переводов за сутки", "many transfers in 24h"),
}
QUESTIONS = {
    "call": {"kk": "Дәл қазір сізбен телефонмен біреу сөйлесіп, осы аударманы жасауды сұрап тұр ма?",
             "ru": "Прямо сейчас с вами кто-то говорит по телефону и просит сделать этот перевод?", "risky": "yes",
             "en": "someone on the phone is asking for this transfer"},
    "remote": {"kk": "Біреудің айтуымен AnyDesk, RustDesk сияқты қолданба орнаттыңыз ба немесе экраныңызды көрсетіп тұрсыз ба?",
               "ru": "Вы установили по чьей-то просьбе приложение вроде AnyDesk или RustDesk либо показываете кому-то экран?",
               "risky": "yes", "en": "installed a remote-access app on someone's request"},
    "safe": {"kk": "Сізге ақшаны «қауіпсіз шотқа» аудару керек деп немесе бұл туралы банкке айтпаңыз деп айтты ма?",
             "ru": "Вам сказали, что деньги нужно перевести на «безопасный счёт», или просили не говорить об этом банку?",
             "risky": "yes", "en": "was told to move money to a 'safe account' / keep it secret"},
    "known": {"kk": "Алушыны жеке танисыз ба және оны өзіңіз таңдадыңыз ба?",
              "ru": "Вы лично знаете получателя и сами его выбрали?", "risky": "no",
              "en": "does not personally know the recipient"},
}
T = {
    "opening": {"kk": "Аудармаңызды бір сәтке тоқтата тұрдық — бұл ақшаңызды қорғау үшін. Байқағанымыз: {r}. Екі-үш қысқа сұраққа жауап беріңізші.",
                "ru": "Мы ненадолго приостановили перевод — это для защиты ваших денег. Что мы заметили: {r}. Ответьте, пожалуйста, на пару коротких вопросов."},
    "cancelled": {"kk": "Аударма жіберілген жоқ, ақшаңыз шотыңызда аман. Бұл — алаяқтардың кең тараған тәсілі: банк қызметкері де, полиция да ешқашан ақшаны «қауіпсіз шотқа» аударуды сұрамайды. Қоңырауды үзіңіз де, банкке картаның артындағы нөмірмен өзіңіз хабарласыңыз.",
                  "ru": "Перевод не отправлен, деньги остались на вашем счёте. Это распространённая схема мошенников: ни сотрудник банка, ни полиция никогда не просят переводить деньги на «безопасный счёт». Положите трубку и сами позвоните в банк по номеру на обратной стороне карты."},
    "delayed": {"kk": "Аударманы {m} минутқа кейінге қалдырдық. Осы уақытта оны қосымшада кез келген сәтте тоқтата аласыз. Асықпай, сенетін адамыңызбен ақылдасып алыңыз.",
                "ru": "Мы отложили перевод на {m} минут. В это время его можно отменить в приложении. Не спешите — посоветуйтесь с человеком, которому доверяете."},
    "approved": {"kk": "Рақмет, бәрі дұрыс. Аударма жіберілді.", "ru": "Спасибо, всё в порядке. Перевод отправлен."},
    "guardian": {"kk": " Сенімді адамыңыз {n} ({rel}) хабардар етілді.", "ru": " Ваш доверенный человек {n} ({rel}) получил уведомление."},
    "unclear": {"kk": "Кешіріңіз, түсінбедім. «Иә» немесе «Жоқ» деп жауап беріңізші.",
                "ru": "Извините, не понял. Ответьте, пожалуйста, «Да» или «Нет»."},
}

MSG = json.loads((HERE.parent / "shared" / "message_rules.json").read_text())


URL_RE = re.compile(r"(?:https?://|www\.)([a-z0-9.-]+)|\b((?:[a-z0-9-]+\.)+(?:kz|top|xyz|click|site|online|info|com|ru|net|org|me|io|shop))\b", re.I)
IBAN_RE = re.compile(r"\bKZ\d{2}(?:[ ]?[A-Z0-9]){14,18}\b", re.I)
PHONE_RE = re.compile(r"(?:\+7|\b8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b")
CARD_RE = re.compile(r"\b(?:\d[ -]?){15}\d\b")


def found_in(text):
    """Links (and whether they fake a known brand) and requisites (masked; whether on the dropper list) in a text."""
    links, seen = [], set()
    for m in URL_RE.finditer(text):
        d = (m.group(1) or m.group(2) or "").lower().strip(".").removeprefix("www.")
        if not d or d in seen:
            continue
        seen.add(d)
        brand = next((b for b in MSG["brands"] if b["token"] in d), None)
        fake = bool(brand) and not any(d == o or d.endswith("." + o) for o in brand["official"])
        links.append({"domain": d, "brand": brand["token"] if brand else None, "fake": fake})
    reqs, rest = [], text
    known = set(saqshy.DROP_LIST) | set(DROP)
    for m in IBAN_RE.finditer(text):
        iban = re.sub(r"\s", "", m.group()).upper()
        masked = f"{iban[:4]} •••• {iban[-4:]}"
        reqs.append({"kind": "iban", "value": masked, "drop": masked in known})
        rest = rest.replace(m.group(), " ")
    for m in PHONE_RE.finditer(rest):
        digits = re.sub(r"\D", "", m.group())
        reqs.append({"kind": "phone", "value": f"+7 7•• ••• •• {digits[-2:]}", "drop": False})
        rest = rest.replace(m.group(), " ")
    for m in CARD_RE.finditer(rest):
        digits = re.sub(r"\D", "", m.group())
        reqs.append({"kind": "card", "value": f"{digits[:4]} •••• •••• {digits[-4:]}", "drop": False})
    return {"links": links, "requisites": reqs}


def message_rules(text, lang):
    """Keyword heuristics plus fake brand domains and dropper accounts: the fallback when no LLM is available and a
    floor under the LLM verdict."""
    hits = [(r["w"], r[lang]) for r in MSG["rules"] if re.search(r["re"], text, re.I)]
    found = found_in(text)
    F = MSG["found_rules"]
    for link in found["links"]:
        if link["fake"]:
            hits.insert(0, (F["fake_domain"]["w"], F["fake_domain"][lang].replace("{d}", link["domain"])))
    for req in found["requisites"]:
        if req["drop"]:
            hits.insert(0, (F["drop_account"]["w"], F["drop_account"][lang].replace("{a}", req["value"])))
    score = 1.0
    for w, _ in hits:
        score *= 1 - w
    score = 1 - score
    verdict = "scam" if score >= 0.6 else "suspicious" if score >= 0.3 else "safe"
    return {"verdict": verdict, "score": round(score, 2), "reasons": [t for _, t in hits[:4]],
            "advice": MSG["advice"][verdict][lang], "source": "rules", "found": found}


TX: dict[str, dict] = {}
NOTIFICATIONS: list[dict] = []


# ---------------------------------------------------------------- scoring
def score(feats: dict):
    row = pd.DataFrame([feats])[FEATURES]
    contrib = booster.predict(xgb.DMatrix(row), pred_contribs=True)[0]
    risk = 1 / (1 + math.exp(-float(contrib.sum())))
    return risk, dict(zip(FEATURES, (float(c) for c in contrib[:-1])))


def factors_for(feats, contrib, limit=6):
    out = []
    for key, c in sorted(contrib.items(), key=lambda kv: -abs(kv[1]))[:limit]:
        fmt = {"v": feats["amount_ratio"], "p": feats["drain_ratio"] * 100, "h": feats["hour"],
               "d": feats["recipient_age_days"]}
        kk, ru, en = (s.format(**fmt) for s in FACTOR[key])
        out.append({"key": key, "kk": kk, "ru": ru, "en": en, "contribution": round(c, 3), "value": feats[key]})
    return out


def level_of(risk):
    """low / medium / high on the policy's 0-100 scale: below warn, below cool, cool and above."""
    t = policy.POLICY["thresholds"]
    return "high" if risk * 100 >= t["cool"] else "medium" if risk * 100 >= t["warn"] else "low"


def now_iso(offset_min=0):
    return (datetime.now(ALMATY) - timedelta(minutes=offset_min)).isoformat(timespec="seconds")


def seed():
    TX.clear()
    NOTIFICATIONS.clear()
    rnd = random.Random(5)
    names = ["Асель Н.", "Ерлан Т.", "Гүлнар А.", "Сергей П.", "Жанар Б.", "Тимур К.", "Ольга В.", "Нұрлан С.",
             "Айдана М.", "Бауыржан О.", "Раушан Е.", "Виктор Л.", "Сәуле Ж.", "Арман Д.", "Қайрат И."]
    drops = list(DROP)
    rows = json.loads((HERE / "seed_transactions.json").read_text())
    for i, r in enumerate(rows):
        fraud = r.pop("is_fraud")
        risk, contrib = score(r)
        lvl = level_of(risk)
        status = "approved" if lvl == "low" or not fraud else ("cancelled" if rnd.random() < 0.7 else "delayed")
        tid = f"TX-{1000 + i}"
        TX[tid] = {
            "id": tid, "time": now_iso(offset_min=6 + i * 7), "client": rnd.choice(names), "age": r["client_age"],
            "recipient": rnd.choice(drops) if r["recipient_drop_score"] > 0.5 else f"KZ{rnd.randint(10, 99)} •••• {rnd.randint(1000, 9999)}",
            "amount": round(r["amount"], -2), "risk": round(risk, 3), "level": lvl, "status": status,
            "paused": lvl != "low", "factors": factors_for(r, contrib), "transcript": [], "guardian": None, "live": False,
            "scam_call": False,
        }


seed()

# ---------------------------------------------------------------- API
app = FastAPI(title="Senim")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Signals(BaseModel):
    on_call: bool = False
    unknown_caller: bool = False
    remote_app: bool = False
    hour: Optional[int] = None
    session_seconds: float = 45
    # minutes since Senim Call Guard on this phone flagged a call as fraud (None = no such call)
    scam_call_minutes: Optional[float] = None
    new_device: bool = False
    vpn: bool = False
    rooted: bool = False
    loan_minutes_ago: Optional[float] = None   # an online loan was taken this many minutes ago
    pasted: bool = False                       # recipient details were pasted from the clipboard
    typing_pause_ms: Optional[float] = None    # the longest pause while the amount was typed


class CheckIn(BaseModel):
    persona: str
    recipient_id: str
    amount: float
    signals: Signals = Signals()
    lang: str = "kk"
    other_bank: bool = False      # the recipient's account is in another bank
    recipient_name: Optional[str] = None   # the name the client typed, for the name check


_ST = json.loads((HERE.parent / "shared" / "saqshy_texts.json").read_text(encoding="utf-8"))
TXT, COOLING_REASON = _ST["messages"], _ST["cooling_reason"]


class VerifyIn(BaseModel):
    tx_id: str
    answer: str                   # self | not_me | no_answer
    lang: str = "kk"


# Bank verification call: before an unusual transfer leaves, the bank calls the client, reads a short notice
# about scams and asks to confirm. 1 = "I am doing it myself" -> the transfer goes; 2 = "not me" -> blocked.
_VC = json.loads((Path(__file__).resolve().parent.parent / "shared" / "verify_call.json").read_text(encoding="utf-8"))
VERIFY_RATIO = _VC["ratio"]                    # this many times the client's usual transfer
VERIFY_OTHER_BANK_MIN = _VC["other_bank_min"]  # transfers to another bank from this amount
VERIFY_REASONS, VERIFY_SCRIPT, VERIFY_DONE = _VC["reasons"], _VC["script"], _VC["done"]


class AnswerIn(BaseModel):
    tx_id: str
    answer: str
    lang: str = "kk"


class MessageIn(BaseModel):
    text: str = ""
    lang: str = "kk"
    image: Optional[str] = None   # a screenshot as a data URL (png / jpeg / webp / gif, up to 5 MB)


class GuardianIn(BaseModel):
    id: str
    action: str  # confirm | stop


def next_question(tx, lang):
    q = QUESTIONS[tx["queue"][0]]
    return {"key": tx["queue"][0], "text": q[lang]}


def notify_guardian(tx, persona, approval=False):
    """Tells the client's trusted contact. approval=True: the transfer waits for their decision (score 80+)."""
    g = saqshy.trusted_active(persona["id"])
    if not g or tx["guardian"] or (tx["amount"] < GUARDIAN_MIN_AMOUNT and not approval):
        return None
    open_ = approval or tx["status"] == "delayed"
    n = {"id": uuid.uuid4().hex[:8], "tx_id": tx["id"], "time": saqshy.now_iso(), "guardian": g["name"],
         "client": persona["name"], "amount": tx["amount"], "recipient": tx["recipient"],
         "status": tx["status"], "risk": tx["risk"], "state": "open" if open_ else "info", "approval": approval,
         "channel": "sms" if g.get("other_bank") else "app"}
    if approval:
        n["deadline"] = (saqshy.now() + timedelta(hours=policy.POLICY["trusted_timeout_hours"])).isoformat(timespec="seconds")
    NOTIFICATIONS.insert(0, n)
    tx["guardian"] = {"name": g["name"], "state": n["state"], "relation": g["relation"]}
    saqshy.audit("Senim", "system", "trusted_notified" if not approval else "trusted_asked", tx["id"],
                 f"{g['name']} ({n['channel']})")
    return g


def expire_approvals():
    """A trusted contact who does not answer within the timeout means no: the transfer is not sent."""
    t = saqshy.now()
    for n in NOTIFICATIONS:
        if n.get("approval") and n["state"] == "open" and datetime.fromisoformat(n["deadline"]) <= t:
            tx = TX[n["tx_id"]]
            n["state"] = tx["guardian"]["state"] = "expired"
            tx["status"] = n["status"] = "cancelled"
            tx["transcript"].append({"from": "bot", "text": TXT["expired"][tx.get("lang", "kk")]})
            saqshy.audit("Senim", "system", "rejected", tx["id"], "trusted contact did not answer in time")


def finish(tx, decision, lang):
    persona = PERSONAS[tx["persona"]]
    tx["status"] = decision
    if decision == "delayed":
        tx["delay_minutes"] = (tx.get("cooling") or {}).get("minutes") or (60 if tx["level"] == "high" else 30)
    g = notify_guardian(tx, persona) if decision != "approved" else None
    msg = llm.final_message(lang, decision, tx["amount"], tx["recipient"], tx["risky"], g["name"] if g else None)
    if not msg:
        msg = T[decision][lang].format(m=tx.get("delay_minutes", 0))
        if g:
            msg += T["guardian"][lang].format(n=g["name"], rel=g["relation"][lang])
    tx["transcript"].append({"from": "bot", "text": msg})
    return {"message": msg, "final": {"decision": decision, "delay_minutes": tx.get("delay_minutes"),
                                      "guardian_notified": bool(g)}}


@app.get("/api/bootstrap")
def bootstrap():
    return {"personas": list(PERSONAS.values()), "recipients": RECIPIENTS, "llm": llm.enabled(),
            "samples": MSG["samples"], "staff": saqshy.SEED["staff"],
            "thresholds": {"pause": PAUSE_AT, "high": HIGH_AT}}


@app.post("/api/transfer/check")
def check(body: CheckIn):
    persona = PERSONAS.get(body.persona)
    rec = next((r for r in RECIPIENTS if r["id"] == body.recipient_id), None)
    if not persona or not rec:
        raise HTTPException(404, "unknown persona or recipient")
    if body.amount <= 0 or body.amount > persona["balance"]:
        raise HTTPException(400, "amount must be positive and within the balance")
    lang = body.lang if body.lang in ("kk", "ru") else "kk"
    free = saqshy.available(persona["id"], persona["balance"])
    if body.amount > free:                                    # money in the safe cannot leave digitally
        saqshy.audit(persona["name"], "client", "blocked_locked", rec["account"], f"{body.amount:.0f} > {free:.0f}")
        raise HTTPException(409, TXT["locked"][lang].format(a=f"{free:,.0f}".replace(",", " ")))
    s = body.signals
    hour = s.hour if s.hour is not None else datetime.now(ALMATY).hour
    drop = DROP.get(rec["account"])
    feats = build_features(body.amount, persona["avg_amount"], persona["balance"], not rec["known"], hour,
                           s.on_call, s.unknown_caller, s.remote_app, s.session_seconds, persona["age"],
                           rec["age_days"], drop["score"] if drop else 0.05, 1)
    model_risk, contrib = score(feats)
    tid = f"TX-{uuid.uuid4().hex[:6].upper()}"
    factors = factors_for(feats, contrib)
    scam_call = s.scam_call_minutes is not None and 0 <= s.scam_call_minutes <= SCAM_CALL_WINDOW_MIN
    if scam_call:
        # the strongest signal there is: the client is probably being coached by that caller right now
        m = round(s.scam_call_minutes)
        factors.insert(0, {"key": "scam_call", "contribution": 5.0, "value": m,
                           "kk": ("Жаңа ғана" if m < 1 else f"{m} минут бұрын") + " телефоныңызда алаяқтық белгілері бар қоңырау анықталды",
                           "ru": ("Только что" if m < 1 else f"{m} мин назад") + " на вашем телефоне распознан звонок с признаками мошенничества",
                           "en": f"Senim flagged a scam phone call on this device {m} minutes ago"})
    names = saqshy.name_check(rec["id"], body.recipient_name) if body.recipient_name and not rec["known"] else None
    pol = policy.evaluate({
        "amount": body.amount, "amount_ratio": body.amount / max(persona["avg_amount"], 1.0), "hour": hour,
        "model_risk": model_risk, "new_recipient": not rec["known"], "other_bank": body.other_bank,
        "new_device": s.new_device, "on_call": s.on_call, "unknown_caller": s.unknown_caller,
        "scam_call_minutes": s.scam_call_minutes, "remote_access": s.remote_app, "rooted": s.rooted, "vpn": s.vpn,
        "drop_list": rec["account"] in saqshy.DROP_LIST,
        "senders_last_hour": saqshy.SEED["senders_last_hour"].get(rec["id"], 0),
        "loan_minutes_ago": s.loan_minutes_ago, "name_match": names["match"] if names else None,
        "pasted": s.pasted, "typing_pause_ms": s.typing_pause_ms})
    risk = pol["score"] / 100
    lvl = level_of(risk)
    tier = pol["tier"]
    tx = {"id": tid, "time": saqshy.now_iso(), "client": persona["name"], "age": persona["age"], "persona": persona["id"],
          "recipient": rec["account"], "amount": body.amount, "risk": round(risk, 3), "model_risk": round(model_risk, 3),
          "level": lvl, "tier": tier, "signals": pol["signals"], "status": "approved", "paused": tier != "pass" or bool(pol["cooling"]),
          "factors": factors, "transcript": [], "guardian": None, "live": True, "risky": [], "lang": lang,
          "drop_network": drop["network"] if drop else None, "scam_call": scam_call, "cooling": pol["cooling"]}
    TX[tid] = tx
    saqshy.audit("Senim", "system", tier, tid, ", ".join(f"{x['key']}+{x['points']}" for x in pol["signals"]) or "no signals")
    resp = {"tx_id": tid, "risk": tx["risk"], "score": pol["score"], "tier": tier, "signals": pol["signals"],
            "level": lvl, "factors": factors, "action": "approve", "name_check": names}

    if tier == "pass":
        if pol["cooling"]:                                    # e.g. the first large transfer to a new recipient
            m = pol["cooling"]["minutes"]
            tx.update(status="delayed", delay_minutes=m)
            msg = TXT["cooling"][lang].format(m=m)
            tx["transcript"].append({"from": "bot", "text": msg})
            resp.update(action="cooling", message=msg, cooling=pol["cooling"] | {"text": COOLING_REASON[pol["cooling"]["reason"]]})
        return resp

    # warn without a live call or remote control: the bank's verification call ("press 1 if it is you")
    if tier == "warn" and not (s.on_call or s.remote_app or scam_call):
        tx.update(status="verifying", verify=[x["key"] for x in pol["signals"]])
        tx["transcript"] += [{"from": "bot", "text": line} for line in VERIFY_SCRIPT[lang]]
        resp.update(action="verify", verify={
            "reasons": [{"kk": x["kk"], "ru": x["ru"]} for x in pol["signals"]], "script": VERIFY_SCRIPT[lang]})
        return resp

    queue = []
    if s.on_call or tier in ("cool", "escalate") or scam_call:
        queue.append("call")
    if s.remote_app:
        queue.append("remote")
    if tier in ("cool", "escalate"):
        queue.append("safe")
    if not rec["known"]:
        queue.append("known")
    tx["queue"] = queue or ["call"]
    tx["status"] = "in_dialog"
    # for the client message, lead with the signals a person can verify themselves
    lead = [x for x in pol["signals"] if x["key"] != "model"][:2] or pol["signals"][:1]
    msg = llm.opening_message(lang, body.amount, rec["account"], [x[lang] for x in lead])
    if not msg:
        reasons = "; ".join(x[lang][0].lower() + x[lang][1:] for x in lead)
        msg = T["opening"][lang].format(r=reasons)
    tx["transcript"].append({"from": "bot", "text": msg})
    q = next_question(tx, lang)
    tx["transcript"].append({"from": "bot", "text": q["text"]})
    resp.update(action="dialog", message=msg, question=q)
    return resp


@app.post("/api/dialog/answer")
def answer(body: AnswerIn):
    tx = TX.get(body.tx_id)
    if not tx or tx["status"] != "in_dialog":
        raise HTTPException(404, "no active dialog for this transfer")
    lang = body.lang if body.lang in ("kk", "ru") else "kk"
    # decisions taken on the app's fraud-warning screen instead of answering the questions
    if body.answer in ("cancel", "delay"):
        tx["transcript"].append({"from": "client", "text": {"cancel": {"kk": "Аударымнан бас тарттым", "ru": "Отменил перевод"},
                                                           "delay": {"kk": "Кейінге қалдырдым", "ru": "Отложил перевод"}}[body.answer][lang]})
        return finish(tx, "cancelled" if body.answer == "cancel" else "delayed", lang)
    key = tx["queue"][0]
    q = QUESTIONS[key]
    raw = body.answer.strip()
    verdict = raw if raw in ("yes", "no") else llm.classify_answer(q["ru"], raw)
    shown = {"yes": {"kk": "Иә", "ru": "Да"}, "no": {"kk": "Жоқ", "ru": "Нет"}}.get(raw, {}).get(lang, raw)
    tx["transcript"].append({"from": "client", "text": shown})
    if verdict == "unclear":
        msg = T["unclear"][lang]
        tx["transcript"].append({"from": "bot", "text": msg})
        return {"message": msg, "question": next_question(tx, lang)}

    tx["queue"].pop(0)
    if verdict == q["risky"]:
        tx["risky"].append(q["en"])
        if key != "known":                      # coached by a caller / remote control: stop right away
            return finish(tx, "cancelled", lang)
    if tx["queue"]:
        nq = next_question(tx, lang)
        tx["transcript"].append({"from": "bot", "text": nq["text"]})
        return {"question": nq}
    # all questions answered. Victims are often coached to answer "correctly", so the policy still decides:
    # 80+ waits for the trusted contact (or an analyst), 60-80 gets a cooling-off period.
    if tx.get("tier") == "escalate":
        return escalate(tx, lang)
    if tx["risky"] or tx["level"] == "high":
        return finish(tx, "delayed", lang)
    return finish(tx, "approved", lang)


def escalate(tx, lang):
    persona = PERSONAS[tx["persona"]]
    g = saqshy.trusted_active(persona["id"])
    tx["status"] = "awaiting_trusted" if g else "awaiting_analyst"
    if g:
        notify_guardian(tx, persona, approval=True)
        msg = TXT["awaiting_trusted"][lang].format(n=g["name"], h=policy.POLICY["trusted_timeout_hours"])
    else:
        msg = TXT["awaiting_analyst"][lang]
    tx["transcript"].append({"from": "bot", "text": msg})
    saqshy.audit("Senim", "system", tx["status"], tx["id"], "score 80+ after the dialog")
    return {"message": msg, "final": {"decision": tx["status"], "guardian_notified": bool(g),
                                      "trusted": g["name"] if g else None}}


@app.post("/api/verify/respond")
def verify_respond(body: VerifyIn):
    tx = TX.get(body.tx_id)
    if not tx or tx["status"] != "verifying":
        raise HTTPException(404, "no verification call for this transfer")
    if body.answer not in VERIFY_DONE:
        raise HTTPException(400, "answer must be self, not_me or no_answer")
    if body.answer == "self" and saqshy.client(tx["persona"]).get("passkey_cred") and not tx.get("passkey_signed"):
        raise HTTPException(403, "confirm the transfer with your passkey first")
    lang = body.lang if body.lang in ("kk", "ru") else "kk"
    pressed = {"self": {"kk": "1 — өзім жасап жатырмын", "ru": "1 — делаю сам"},
               "not_me": {"kk": "2 — мен жасаған жоқпын", "ru": "2 — это не я"},
               "no_answer": {"kk": "Қоңырауға жауап берілмеді", "ru": "Звонок без ответа"}}[body.answer][lang]
    tx["transcript"].append({"from": "client", "text": pressed})
    saqshy.audit(tx["client"], "client", "verify_" + body.answer, tx["id"], "bank verification call")
    decision = {"self": "approved", "not_me": "cancelled", "no_answer": "delayed"}[body.answer]
    cooling = tx.get("cooling")
    if decision == "approved" and cooling:          # confirmed, but a new recipient / fresh loan still waits
        decision = "delayed"
    tx["status"] = decision
    if decision == "delayed":
        tx["delay_minutes"] = cooling["minutes"] if cooling and body.answer == "self" else 60
    g = notify_guardian(tx, PERSONAS[tx["persona"]]) if decision != "approved" else None
    msg = VERIFY_DONE[body.answer][lang]
    if body.answer == "self" and cooling:
        msg = TXT["cooling"][lang].format(m=cooling["minutes"])
    tx["transcript"].append({"from": "bot", "text": msg})
    return {"message": msg, "final": {"decision": decision, "delay_minutes": tx.get("delay_minutes"),
                                      "guardian_notified": bool(g), "verified": body.answer == "self"}}


NO_VISION = {"kk": "Скриншотты оқу үшін ЖИ қосылмаған. Хабарламаның мәтінін көшіріп қойыңыз.",
             "ru": "Чтобы прочитать скриншот, нужен ИИ, а он не подключён. Скопируйте и вставьте текст сообщения."}


@app.post("/api/message/check")
def message_check(body: MessageIn):
    lang = body.lang if body.lang in ("kk", "ru") else "kk"
    text = body.text.strip()
    image = None
    if body.image:
        m = re.match(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$", body.image)
        if not m or len(m.group(2)) > 7_000_000:
            raise HTTPException(400, "a png, jpeg, webp or gif image up to 5 MB is expected")
        if not llm.enabled_for_images():
            raise HTTPException(503, NO_VISION[lang])
        image = (m.group(1), m.group(2))
    if not text and not image:
        raise HTTPException(400, "empty message")
    ai = llm.check_message(lang, text, image)
    if image and not ai:
        raise HTTPException(503, NO_VISION[lang])
    # the rules also read what the screenshot says, so a fake domain or a dropper account on it is still caught
    base = message_rules(" ".join(x for x in (text, ai.get("text", "") if ai else "") if x), lang)
    if not ai:
        return base
    order = ["safe", "suspicious", "scam"]
    # never let the LLM talk a rule-flagged scam down to "safe"
    verdict = max(ai["verdict"], base["verdict"], key=order.index)
    return {"verdict": verdict, "score": base["score"], "reasons": ai["reasons"] or base["reasons"],
            "advice": ai["advice"] if verdict == ai["verdict"] and ai["advice"] else MSG["advice"][verdict][lang],
            "source": "llm", "found": base["found"], "image_text": ai.get("text", "")}


@app.get("/api/guardian/notifications")
def guardian_notifications():
    expire_approvals()
    return NOTIFICATIONS


@app.post("/api/guardian/respond")
def guardian_respond(body: GuardianIn):
    n = next((x for x in NOTIFICATIONS if x["id"] == body.id), None)
    if not n or n["state"] != "open" or body.action not in ("confirm", "stop"):
        raise HTTPException(400, "notification is not awaiting a decision")
    tx = TX[n["tx_id"]]
    tx["status"] = "approved" if body.action == "confirm" else "cancelled"
    n["state"] = tx["guardian"]["state"] = "confirmed" if body.action == "confirm" else "stopped"
    n["status"] = tx["status"]
    saqshy.audit(n["guardian"], "trusted", "approved" if body.action == "confirm" else "rejected", tx["id"],
                 "trusted contact decision")
    return n


@app.get("/api/transfer/{tx_id}")
def transfer(tx_id: str):
    if tx_id not in TX:
        raise HTTPException(404, "not found")
    return TX[tx_id]


@app.get("/api/dashboard")
def dashboard():
    expire_approvals()
    txs = sorted(TX.values(), key=lambda t: t["time"], reverse=True)
    paused = [t for t in txs if t["paused"]]
    held = ("cancelled", "delayed", "awaiting_trusted", "awaiting_analyst")
    done = [t for t in paused if t["status"] in ("approved", "cancelled")]
    return {
        "summary": {
            "checked": len(txs), "paused": len(paused),
            "cancelled": sum(t["status"] == "cancelled" for t in txs),
            "delayed": sum(t["status"] == "delayed" for t in txs),
            "awaiting": sum(t["status"] in ("awaiting_trusted", "awaiting_analyst") for t in txs),
            "protected_amount": sum(t["amount"] for t in txs if t["status"] in held),
            # paused, then let through after checking: the friction honest clients paid
            "false_positive_share": round(sum(t["status"] == "approved" for t in done) / len(done), 3) if done else 0,
        },
        "adoption": saqshy.adoption(), "drop_list": list(saqshy.DROP_LIST.values()),
        "transactions": txs, "metrics": METRICS, "graph_quality": GRAPH["quality"], "llm": llm.enabled(),
    }


@app.get("/api/graph")
def graph():
    return GRAPH


@app.post("/api/demo/reset")
def reset():
    saqshy.reset()
    sync_guardians()
    seed()
    return {"ok": True}


# ---------------------------------------------------------------- Senim Saqshy: client protection
class PersonaIn(BaseModel):
    persona: str


class TrustedIn(BaseModel):
    persona: str
    name: str
    phone: str
    relation_kk: str = "туысы"
    relation_ru: str = "родственник"
    other_bank: bool = False      # the trusted contact banks elsewhere: the request goes by SMS / eGov


class LockIn(BaseModel):
    persona: str
    amount: float


class UnlockIn(BaseModel):
    persona: str
    amount: float
    channel: str                  # atm | branch
    biometric: bool = False


class SessionIn(BaseModel):
    persona: str
    staff_id: Optional[str] = None


class NameIn(BaseModel):
    recipient_id: str
    name: str


class DecideIn(BaseModel):
    tx_id: str
    action: str                   # approve | reject | to_trusted
    analyst: str = "Аналитик"
    reason: str = ""


class DropIn(BaseModel):
    account: str
    reason: str = ""
    analyst: str = "Аналитик"


class ClockIn(BaseModel):
    hours: float


def persona_or_404(pid):
    if pid not in PERSONAS:
        raise HTTPException(404, "unknown persona")
    return PERSONAS[pid]


def sync_guardians():
    """The app's older 'guardian' view of a persona follows the trusted contact setting."""
    for pid, p in PERSONAS.items():
        g = saqshy.trusted_active(pid)
        p["guardian"] = {"name": g["name"].split()[0], "relation": g["relation"]} if g else None


def protection(pid):
    p, c = persona_or_404(pid), saqshy.client(pid)
    return {"persona": pid, "balance": p["balance"], "locked": c["locked"], "available": saqshy.available(pid, p["balance"]),
            "passkey": bool(c["passkey"]), "passkey_device": bool(c.get("passkey_cred")), "trusted": c["trusted"] and c["trusted"] | {"phone": saqshy.mask_phone(c["trusted"]["phone"])},
            "index": saqshy.security_index(c), "index_parts": saqshy.INDEX_POINTS, "call": saqshy.SESSIONS.get(pid)}


@app.get("/api/protect/{pid}")
def protect_state(pid: str):
    return protection(pid)


@app.post("/api/protect/trusted/invite")
def trusted_invite(body: TrustedIn):
    persona_or_404(body.persona)
    if len(body.name.strip()) < 2 or len(re.sub(r"\D", "", body.phone)) < 10:
        raise HTTPException(400, "name and a full phone number are required")
    saqshy.client(body.persona)["trusted"] = {
        "name": body.name.strip(), "relation": {"kk": body.relation_kk, "ru": body.relation_ru}, "phone": body.phone,
        "other_bank": body.other_bank, "state": "invited"}
    saqshy.audit(PERSONAS[body.persona]["name"], "client", "trusted_invited", body.persona,
                 f"{body.name} {body.phone} via {'sms' if body.other_bank else 'app'}")
    sync_guardians()
    return protection(body.persona)


@app.post("/api/protect/trusted/accept")
def trusted_accept(body: PersonaIn):
    t = saqshy.client(body.persona).get("trusted")
    if not t or t["state"] != "invited":
        raise HTTPException(400, "no pending invitation")
    t["state"] = "active"
    saqshy.audit(t["name"], "trusted", "trusted_accepted", body.persona, "consent given")
    sync_guardians()
    return protection(body.persona)


@app.post("/api/protect/trusted/remove")
def trusted_remove(body: PersonaIn):
    persona_or_404(body.persona)
    saqshy.client(body.persona)["trusted"] = None
    saqshy.audit(PERSONAS[body.persona]["name"], "client", "trusted_removed", body.persona)
    sync_guardians()
    return protection(body.persona)


@app.post("/api/protect/lock")
def lock(body: LockIn):
    p = persona_or_404(body.persona)
    c = saqshy.client(body.persona)
    if body.amount < 0 or body.amount > p["balance"]:
        raise HTTPException(400, "amount must be within the balance")
    if body.amount < c["locked"]:
        raise HTTPException(403, "money leaves the safe only at an ATM or a branch with biometrics")
    c["locked"] = body.amount
    saqshy.audit(p["name"], "client", "locked", body.persona, f"{body.amount:.0f}")
    return protection(body.persona)


@app.post("/api/protect/unlock")
def unlock(body: UnlockIn):
    """Simulates the ATM / branch: the safe opens only there and only after biometrics."""
    p = persona_or_404(body.persona)
    c = saqshy.client(body.persona)
    if body.channel not in ("atm", "branch") or not body.biometric:
        raise HTTPException(403, "the safe opens only at an ATM or a branch after biometrics")
    c["locked"] = max(0, c["locked"] - body.amount)
    saqshy.audit(p["name"], "client", "unlocked", body.persona, f"{body.amount:.0f} at {body.channel}, biometrics ok")
    return protection(body.persona)


@app.post("/api/callstatus/start")
def call_start(body: SessionIn):
    persona_or_404(body.persona)
    st = saqshy.staff(body.staff_id or saqshy.SEED["staff"][0]["id"])
    if not st:
        raise HTTPException(404, "unknown staff id")
    saqshy.SESSIONS[body.persona] = st | {"since": saqshy.now_iso()}
    saqshy.audit(st["name"], "staff", "call_started", body.persona, st["id"])
    return saqshy.SESSIONS[body.persona]


@app.post("/api/callstatus/end")
def call_end(body: SessionIn):
    st = saqshy.SESSIONS.pop(body.persona, None)
    if st:
        saqshy.audit(st["name"], "staff", "call_ended", body.persona, st["id"])
    return {"ok": True}


@app.get("/api/callstatus/{pid}")
def call_status(pid: str):
    """'Is this really the bank?': an open staff session means a real bank call, with the employee's name and ID."""
    persona_or_404(pid)
    st = saqshy.SESSIONS.get(pid)
    return {"active": bool(st), "staff": st}


@app.post("/api/recipient/check")
def recipient_check(body: NameIn):
    rec = next((r for r in RECIPIENTS if r["id"] == body.recipient_id), None)
    if not rec:
        raise HTTPException(404, "unknown recipient")
    r = saqshy.name_check(rec["id"], body.name) or {"match": None, "owner_masked": None}
    return r | {"drop_list": rec["account"] in saqshy.DROP_LIST}


@app.post("/api/analyst/decide")
def analyst_decide(body: DecideIn):
    tx = TX.get(body.tx_id)
    if not tx or tx["status"] not in ("awaiting_analyst", "awaiting_trusted", "in_dialog", "delayed", "verifying"):
        raise HTTPException(400, "this transfer is not waiting for a decision")
    if body.action == "to_trusted":
        g = notify_guardian(tx, PERSONAS[tx["persona"]], approval=True) if tx.get("persona") else None
        if not g:
            raise HTTPException(400, "the client has no active trusted contact")
        tx["status"] = "awaiting_trusted"
    elif body.action in ("approve", "reject"):
        tx["status"] = "approved" if body.action == "approve" else "cancelled"
        for n in NOTIFICATIONS:
            if n["tx_id"] == tx["id"] and n["state"] == "open":
                n["state"], n["status"] = "closed", tx["status"]
    else:
        raise HTTPException(400, "action must be approve, reject or to_trusted")
    saqshy.audit(body.analyst, "analyst", body.action, tx["id"], body.reason)
    return tx


@app.post("/api/analyst/droplist")
def droplist_add(body: DropIn):
    if not body.account.strip():
        raise HTTPException(400, "account is required")
    saqshy.DROP_LIST[body.account] = {"account": body.account, "reason": body.reason, "by": body.analyst, "time": saqshy.now_iso()}
    saqshy.audit(body.analyst, "analyst", "droplist_added", body.account, body.reason)
    return list(saqshy.DROP_LIST.values())


class PasskeyBeginIn(BaseModel):
    persona: str


class PasskeyFinishIn(BaseModel):
    persona: str
    credential_id: str
    public_key: str           # SPKI, base64url (response.getPublicKey())
    alg: int
    client_data_json: str


class PasskeyTxIn(BaseModel):
    tx_id: str


class PasskeyAssertIn(BaseModel):
    tx_id: str
    credential_id: str
    authenticator_data: str
    client_data_json: str
    signature: str


REG_CHALLENGES = {}


def rp_id_of(request: Request):
    origin = request.headers.get("origin") or ""
    host = origin.split("://")[-1] if origin else request.headers.get("host", "")
    return host.split(":")[0]


@app.post("/api/passkey/register/begin")
def passkey_begin(body: PasskeyBeginIn):
    p = persona_or_404(body.persona)
    REG_CHALLENGES[body.persona] = uuid.uuid4().bytes + uuid.uuid4().bytes
    return {"challenge": webauthn.b64u(REG_CHALLENGES[body.persona]), "rp_name": "Senim",
            "user_id": webauthn.b64u(body.persona.encode()), "user_name": p["name"]}


@app.post("/api/passkey/register/finish")
def passkey_finish(body: PasskeyFinishIn, request: Request):
    persona_or_404(body.persona)
    challenge = REG_CHALLENGES.pop(body.persona, None)
    if not challenge:
        raise HTTPException(400, "start the registration first")
    try:
        webauthn.verify_registration(body.client_data_json, challenge, rp_id_of(request), body.public_key, body.alg)
    except (webauthn.PasskeyError, ValueError) as e:
        raise HTTPException(400, f"passkey not accepted: {e}") from e
    c = saqshy.client(body.persona)
    c["passkey"], c["passkey_cred"] = True, {"id": body.credential_id, "public_key": body.public_key, "alg": body.alg}
    saqshy.audit(PERSONAS[body.persona]["name"], "client", "passkey_added", body.persona)
    return protection(body.persona)


@app.post("/api/passkey/challenge")
def passkey_challenge(body: PasskeyTxIn):
    """What the client signs: the transfer's own details (amount, recipient, id), not a code."""
    tx = TX.get(body.tx_id)
    if not tx or not tx.get("persona"):
        raise HTTPException(404, "unknown transfer")
    cred = saqshy.client(tx["persona"]).get("passkey_cred")
    if not cred:
        return {"required": False}
    details = {"tx": tx["id"], "amount": int(tx["amount"]), "recipient": tx["recipient"], "nonce": uuid.uuid4().hex[:12]}
    tx["passkey_details"] = details
    return {"required": True, "challenge": webauthn.b64u(webauthn.tx_challenge(details)),
            "credential_ids": [cred["id"]], "details": details}


@app.post("/api/passkey/verify")
def passkey_verify(body: PasskeyAssertIn, request: Request):
    tx = TX.get(body.tx_id)
    if not tx or not tx.get("passkey_details"):
        raise HTTPException(400, "ask for a challenge first")
    cred = saqshy.client(tx["persona"]).get("passkey_cred")
    if not cred or body.credential_id != cred["id"]:
        raise HTTPException(403, "unknown passkey")
    try:
        r = webauthn.verify_assertion(cred["public_key"], cred["alg"], body.authenticator_data, body.client_data_json,
                                      body.signature, webauthn.tx_challenge(tx["passkey_details"]), rp_id_of(request))
    except (webauthn.PasskeyError, ValueError) as e:
        saqshy.audit(tx["client"], "client", "passkey_failed", tx["id"], str(e))
        raise HTTPException(403, f"passkey check failed: {e}") from e
    tx["passkey_signed"] = True
    saqshy.audit(tx["client"], "client", "passkey_signed", tx["id"],
                 f"{tx['passkey_details']['amount']} -> {tx['recipient']}, user verified: {r['user_verified']}")
    return {"ok": True, **r}


@app.get("/api/audit")
def audit_log():
    return saqshy.AUDIT[:200]


@app.post("/api/demo/clock")
def demo_clock(body: ClockIn):
    """Moves the demo clock forward, e.g. 24 hours to show what happens when the trusted contact stays silent."""
    saqshy.CLOCK["offset_hours"] += max(0.0, body.hours)
    expire_approvals()
    return {"offset_hours": saqshy.CLOCK["offset_hours"], "now": saqshy.now_iso()}


sync_guardians()

DIST = HERE.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
