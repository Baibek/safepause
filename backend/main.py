"""Senim API: real-time transfer scoring, AI dialog, guardian mode, analyst dashboard."""
import json
import math
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import graph as graph_mod
import llm
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


def message_rules(text, lang):
    """Keyword heuristics: the fallback when no LLM is available and a floor under the LLM verdict."""
    import re
    hits = [r for r in MSG["rules"] if re.search(r["re"], text, re.I)]
    score = 1.0
    for r in hits:
        score *= 1 - r["w"]
    score = 1 - score
    verdict = "scam" if score >= 0.6 else "suspicious" if score >= 0.3 else "safe"
    return {"verdict": verdict, "score": round(score, 2), "reasons": [r[lang] for r in hits[:3]],
            "advice": MSG["advice"][verdict][lang], "source": "rules"}


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
    return "high" if risk >= HIGH_AT else "medium" if risk >= PAUSE_AT else "low"


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


class CheckIn(BaseModel):
    persona: str
    recipient_id: str
    amount: float
    signals: Signals = Signals()
    lang: str = "kk"


class AnswerIn(BaseModel):
    tx_id: str
    answer: str
    lang: str = "kk"


class MessageIn(BaseModel):
    text: str
    lang: str = "kk"


class GuardianIn(BaseModel):
    id: str
    action: str  # confirm | stop


def next_question(tx, lang):
    q = QUESTIONS[tx["queue"][0]]
    return {"key": tx["queue"][0], "text": q[lang]}


def notify_guardian(tx, persona):
    g = persona["guardian"]
    if not g or tx["amount"] < GUARDIAN_MIN_AMOUNT or tx["guardian"]:
        return None
    n = {"id": uuid.uuid4().hex[:8], "tx_id": tx["id"], "time": now_iso(), "guardian": g["name"],
         "client": persona["name"], "amount": tx["amount"], "recipient": tx["recipient"],
         "status": tx["status"], "risk": tx["risk"], "state": "open" if tx["status"] == "delayed" else "info"}
    NOTIFICATIONS.insert(0, n)
    tx["guardian"] = {"name": g["name"], "state": n["state"]}
    return g


def finish(tx, decision, lang):
    persona = PERSONAS[tx["persona"]]
    tx["status"] = decision
    if decision == "delayed":
        tx["delay_minutes"] = 60 if tx["level"] == "high" else 30
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
            "samples": MSG["samples"],
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
    s = body.signals
    hour = s.hour if s.hour is not None else datetime.now(ALMATY).hour
    drop = DROP.get(rec["account"])
    feats = build_features(body.amount, persona["avg_amount"], persona["balance"], not rec["known"], hour,
                           s.on_call, s.unknown_caller, s.remote_app, s.session_seconds, persona["age"],
                           rec["age_days"], drop["score"] if drop else 0.05, 1)
    risk, contrib = score(feats)
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
        risk = max(risk, 0.95)
    lvl = level_of(risk)
    tx = {"id": tid, "time": now_iso(), "client": persona["name"], "age": persona["age"], "persona": persona["id"],
          "recipient": rec["account"], "amount": body.amount, "risk": round(risk, 3), "level": lvl,
          "status": "approved", "paused": lvl != "low", "factors": factors, "transcript": [], "guardian": None,
          "live": True, "risky": [], "drop_network": drop["network"] if drop else None, "scam_call": scam_call}
    TX[tid] = tx
    resp = {"tx_id": tid, "risk": tx["risk"], "level": lvl, "factors": factors, "action": "approve"}
    if lvl == "low":
        return resp

    queue = []
    if s.on_call or lvl == "high" or scam_call:
        queue.append("call")
    if s.remote_app:
        queue.append("remote")
    if lvl == "high":
        queue.append("safe")
    if not rec["known"]:
        queue.append("known")
    tx["queue"] = queue or ["call"]
    tx["status"] = "in_dialog"
    # for the client message, lead with the signals a person can verify themselves
    client_first = ["scam_call", "on_call", "unknown_caller", "remote_app", "recipient_drop_score", "new_recipient", "amount_ratio"]
    positive = sorted((f for f in factors if f["contribution"] > 0 and not (f["key"] == "amount_ratio" and f["value"] < 1.5)),
                      key=lambda f: client_first.index(f["key"]) if f["key"] in client_first else 99)[:3]
    msg = llm.opening_message(lang, body.amount, rec["account"], [f["en"] for f in positive])
    if not msg:
        reasons = "; ".join(f[lang][0].lower() + f[lang][1:] for f in positive[:2])
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
    # all questions answered. Victims are often coached to answer "correctly",
    # so a high model risk still earns a cooling-off period instead of an instant transfer.
    if tx["risky"] or tx["level"] == "high":
        return finish(tx, "delayed", lang)
    return finish(tx, "approved", lang)


@app.post("/api/message/check")
def message_check(body: MessageIn):
    lang = body.lang if body.lang in ("kk", "ru") else "kk"
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "empty message")
    base = message_rules(text, lang)
    ai = llm.check_message(lang, text)
    if not ai:
        return base
    order = ["safe", "suspicious", "scam"]
    # never let the LLM talk a rule-flagged scam down to "safe"
    verdict = max(ai["verdict"], base["verdict"], key=order.index)
    return {"verdict": verdict, "score": base["score"], "reasons": ai["reasons"] or base["reasons"],
            "advice": ai["advice"] if verdict == ai["verdict"] and ai["advice"] else MSG["advice"][verdict][lang],
            "source": "llm"}


@app.get("/api/guardian/notifications")
def guardian_notifications():
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
    return n


@app.get("/api/transfer/{tx_id}")
def transfer(tx_id: str):
    if tx_id not in TX:
        raise HTTPException(404, "not found")
    return TX[tx_id]


@app.get("/api/dashboard")
def dashboard():
    txs = sorted(TX.values(), key=lambda t: t["time"], reverse=True)
    paused = [t for t in txs if t["paused"]]
    return {
        "summary": {
            "checked": len(txs), "paused": len(paused),
            "cancelled": sum(t["status"] == "cancelled" for t in txs),
            "delayed": sum(t["status"] == "delayed" for t in txs),
            "protected_amount": sum(t["amount"] for t in txs if t["status"] in ("cancelled", "delayed")),
        },
        "transactions": txs, "metrics": METRICS, "graph_quality": GRAPH["quality"], "llm": llm.enabled(),
    }


@app.get("/api/graph")
def graph():
    return GRAPH


@app.post("/api/demo/reset")
def reset():
    seed()
    return {"ok": True}


DIST = HERE.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
