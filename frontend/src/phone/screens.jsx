import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const hhmm = (iso) => (iso || "").slice(11, 16);
const statusTone = { approved: "ok", delayed: "warn", cancelled: "bad", in_dialog: "warn" };

/** The signals worth showing a client: what raised the risk, social-engineering signs first, no "1x your usual" noise. */
export function tellingFactors(factors = []) {
  const first = ["scam_call", "on_call", "unknown_caller", "remote_app", "recipient_drop_score", "new_recipient", "recipient_age_days", "amount_ratio", "drain_ratio", "is_night", "session_dev"];
  return factors
    .filter((f) => f.contribution > 0 && !(f.key === "amount_ratio" && f.value < 1.5))
    .sort((a, b) => (first.indexOf(a.key) + 99) % 99 - (first.indexOf(b.key) + 99) % 99);
}

function TxRow({ tx, P }) {
  return (
    <li className="tx-row">
      <span className={"tx-ic " + statusTone[tx.status]}><Icon name={tx.status === "cancelled" ? "close" : tx.status === "approved" ? "send" : "pause"} size={18} /></span>
      <span className="tx-main">
        <b>{tx.recipient}</b>
        <small>{hhmm(tx.time)} · <span className={"risk-txt " + tx.level}>{P.riskShort[tx.level]}</span>{tx.scam_call ? ` · ${P.afterCall}` : ""}</small>
      </span>
      <span className="tx-side">
        <b className={tx.status === "approved" ? "" : "muted"}>−{fmt(tx.amount)} ₸</b>
        <span className={"pill " + statusTone[tx.status]}>{P.status[tx.status]}</span>
      </span>
    </li>
  );
}

export function HomeScreen({ persona, balance, P, t, history, scamCallMinutes, onDismissCall, go }) {
  const first = persona.name.split(" ")[0];
  return (
    <div className="app-screen home">
      <header className="home-head">
        <span className="avatar">{persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
        <div><small>SafePause</small><b>{P.hello(first)}</b></div>
      </header>
      <section className="balance-card">
        <span>{P.available}</span>
        <b>{fmt(balance)} <i>₸</i></b>
        <small>{P.card}</small>
      </section>
      <div className="quick">
        {[["send", "transfer"], ["message", "messages"], ["clock", "history"], ["guardian", "guardian"]].map(([icon, to], i) => (
          <button key={to} onClick={() => go(to)}><span><Icon name={icon} /></span>{Object.values(P.actions)[i]}</button>
        ))}
      </div>
      {scamCallMinutes != null ? (
        <section className="sec-card alert" role="status">
          <span className="sec-ic"><Icon name="alert" /></span>
          <div><b>{t.callAlert(Math.round(scamCallMinutes))}</b><small>{t.callAlertSub}</small>
            <button className="link-btn" onClick={onDismissCall}>{t.callAlertOk}</button></div>
        </section>
      ) : (
        <section className="sec-card">
          <span className="sec-ic"><Icon name="shield" /></span>
          <div><b>{P.secureTitle}</b><small>{P.secureSub}</small></div>
        </section>
      )}
      <div className="list-head"><h3>{P.recent}</h3>{history.length > 0 && <button className="link-btn" onClick={() => go("history")}>{P.all}</button>}</div>
      {history.length ? <ul className="tx-list">{history.slice(0, 3).map((tx) => <TxRow key={tx.id} tx={tx} P={P} />)}</ul>
        : <p className="empty">{P.emptyHistory}</p>}
    </div>
  );
}

/** Animated check: steps tick while the request runs, then the score counts up and the signals arrive one by one. */
export function AnalysisScreen({ check, P, lang, amount, onLow, onRisk }) {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (check) return;
    const i = setInterval(() => setStep((s) => Math.min(s + 1, P.scanSteps.length - 1)), 260);
    return () => clearInterval(i);
  }, [check]);
  const target = check ? Math.round(check.risk * 100) : 0;
  useEffect(() => {
    if (!check) return;
    if (reduceMotion()) { setShown(target); return; }
    let raf, start;
    const tick = (ts) => {
      start ??= ts;
      const k = Math.min(1, (ts - start) / 900);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [check]);
  const level = check?.level || "low";
  const R = 64, C = 2 * Math.PI * R;
  const signals = check ? tellingFactors(check.factors).slice(0, 4) : [];
  return (
    <div className="app-screen analysis">
      <p className="an-amount">{fmt(amount)} ₸</p>
      <div className={"ring " + (check ? level : "scanning")} aria-live="polite">
        <svg viewBox="0 0 160 160" width="168" height="168" aria-hidden="true">
          <circle cx="80" cy="80" r={R} className="ring-track" />
          <circle cx="80" cy="80" r={R} className="ring-value" strokeDasharray={C}
            strokeDashoffset={check ? C * (1 - shown / 100) : C * 0.72} transform="rotate(-90 80 80)" />
        </svg>
        <div className="ring-label">
          {check ? <><b>{shown}</b><small>{P.risk} · {P.level[level]}</small></> : <small>{P.scanTitle}</small>}
        </div>
      </div>
      {!check ? (
        <ul className="scan-steps">
          {P.scanSteps.map((s, i) => <li key={i} className={i < step ? "done" : i === step ? "now" : ""}><Icon name={i < step ? "check" : "clock"} size={16} />{s}</li>)}
        </ul>
      ) : (
        <>
          <h3 className="an-title">{level === "low" ? P.lowText : P.why}</h3>
          {level !== "low" && (
            <ul className="signals">
              {signals.map((f, i) => <li key={f.key} style={{ "--i": i }}><span className={"dot " + (f.key === "scam_call" || f.contribution > 1.5 ? "high" : "medium")} />{f[lang]}</li>)}
            </ul>
          )}
          <div className="cta-stack">
            {level === "low"
              ? <button className="btn primary-blue" onClick={onLow}>{P.sendNow}</button>
              : <button className="btn danger" onClick={onRisk}>{P.seeWarning}</button>}
          </div>
        </>
      )}
    </div>
  );
}

export function WarningScreen({ check, P, lang, busy, onCancel, onDelay, onProceed }) {
  const minutes = check.level === "high" ? 60 : 30;
  const signals = tellingFactors(check.factors).slice(0, 4);
  return (
    <div className="app-screen warning">
      <div className="warn-hero">
        <span className="warn-ic"><Icon name="alert" size={34} stroke={2} /></span>
        <h2>{P.warnTitle}</h2>
        <p>{check.message}</p>
      </div>
      <h3 className="sec-title">{P.warnSeen}</h3>
      <ul className="signals solid">
        {signals.map((f) => <li key={f.key}><span className={"dot " + (f.key === "scam_call" || f.contribution > 1.5 ? "high" : "medium")} />{f[lang]}</li>)}
      </ul>
      <div className="cta-stack">
        <button className="btn primary-blue" disabled={busy} onClick={onCancel}>{P.cancel}</button>
        <button className="btn outline" disabled={busy} onClick={() => onDelay(minutes)}>{P.wait(minutes)}</button>
        <button className="btn text" disabled={busy} onClick={onProceed}>{P.proceed}</button>
        <small className="hint-c">{P.proceedHint}</small>
      </div>
    </div>
  );
}

export function DialogScreen({ P, t, amount, chat, busy, final, onAnswer, onResult }) {
  const [text, setText] = useState("");
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "end" }); }, [chat, busy, final]);
  return (
    <div className="app-screen dialog-x">
      <header className="nav-head">
        <span className="bot-ava"><Icon name="pause" size={18} stroke={2.6} /></span>
        <div><b>{t.assistant}</b><small>{t.paused} · {fmt(amount)} ₸</small></div>
      </header>
      <div className="thread">
        {chat.map((m, i) => <div key={i} className={"bubble " + (m.from === "client" ? "me" : "them")}>{m.text}</div>)}
        {busy && <div className="bubble them typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      {final ? (
        <div className="composer"><button className="btn primary-blue" onClick={onResult}>{P.toResult}</button></div>
      ) : (
        <div className="composer">
          <div className="yn-x">
            <button disabled={busy} onClick={() => onAnswer("yes", t.yes)}>{t.yes}</button>
            <button disabled={busy} onClick={() => onAnswer("no", t.no)}>{t.no}</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAnswer(text.trim(), text.trim()); setText(""); } }}>
            <input id="dialog-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.typeAnswer} />
            <button disabled={busy || !text.trim()} aria-label={t.send}><Icon name="send" size={18} stroke={2.2} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

export function ResultScreen({ final, P, t, recipientName, amount, check, note, onHome, onGuardian }) {
  const d = final.decision;
  const icon = { approved: "check", delayed: "pause", cancelled: "close" }[d];
  const rows = [
    [P.details.to, recipientName], [P.details.amount, `${fmt(amount)} ₸`], [P.details.when, new Date().toTimeString().slice(0, 5)],
    ...(check ? [[P.details.risk, `${Math.round(check.risk * 100)} · ${P.level[check.level]}`], [P.details.id, check.tx_id]] : []),
  ];
  return (
    <div className={"app-screen result " + d}>
      <span className="res-ic"><Icon name={icon} size={40} stroke={2.4} /></span>
      <h2>{P.resultTitle[d]}</h2>
      <p className="res-sub">{d === "delayed" ? P.resultSub.delayed(final.delay_minutes) : P.resultSub[d]}</p>
      <dl className="details">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {final.guardian_notified && (
        <button className="guardian-chip" onClick={onGuardian}>
          <Icon name="guardian" size={20} />
          <span><b>{t.guardianBadge}</b><small>{note ? t.gState[note.state] : ""}</small></span>
          <Icon name="chevron" size={18} />
        </button>
      )}
      <div className="cta-stack"><button className="btn primary-blue" onClick={onHome}>{P.home}</button></div>
    </div>
  );
}

export function GuardianScreen({ persona, notes, P, t, lang, onRespond }) {
  const mine = notes.filter((n) => n.client === persona.name);
  const g = persona.guardian;
  return (
    <div className="app-screen guardian-x">
      <h1 className="large-title">{P.guardianTitle}</h1>
      <section className="g-card">
        <span className="avatar alt">{g ? g.name[0] : "—"}</span>
        <div><b>{g ? P.guardianWho({ name: g.name, relation: g.relation[lang] }) : P.guardianNone}</b>{g && <small>{P.guardianRole}</small>}</div>
      </section>
      {g && (mine.length === 0 ? <p className="empty">{P.guardianEmpty}</p> : (
        <>
          <h3 className="sec-title">{P.guardianPreview}</h3>
          {mine.map((n) => (
            <div key={n.id} className="g-note">
              <div className="notif">
                <span className="notif-app"><Icon name="pause" size={14} stroke={2.6} /></span>
                <div><small>SafePause · {hhmm(n.time)}</small><p>{t.gText(n)}</p></div>
              </div>
              <span className={"pill " + ({ open: "warn", confirmed: "ok", stopped: "bad", info: "bad" }[n.state])}>{t.gState[n.state]}</span>
              {n.state === "open" && (
                <>
                  <small className="hint-c">{P.guardianDemo}</small>
                  <div className="g-actions">
                    <button className="btn danger" onClick={() => onRespond(n.id, "stop")}>{P.reject}</button>
                    <button className="btn outline" onClick={() => onRespond(n.id, "confirm")}>{P.approve}</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      ))}
    </div>
  );
}

export function HistoryScreen({ history, P, loading }) {
  return (
    <div className="app-screen history">
      <h1 className="large-title">{P.historyTitle}</h1>
      {loading && !history.length ? <p className="empty">{P.loading}</p>
        : history.length ? <ul className="tx-list">{history.map((tx) => <TxRow key={tx.id} tx={tx} P={P} />)}</ul>
          : <p className="empty">{P.emptyHistory}</p>}
    </div>
  );
}

const URL_RE = /(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(?:top|xyz|click|site|online|info)\/?\S*)/gi;

/** SMS / WhatsApp check: the message as a bubble with its links marked, then the verdict and reasons. */
export function MessagesScreen({ boot, lang, t, P }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [checked, setChecked] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (value = text) => {
    if (!value.trim() || busy) return;
    setBusy(true); setRes(null); setChecked(value);
    try { setRes(await api("/api/message/check", { text: value, lang })); } catch (e) { setRes({ error: String(e.message) }); }
    setBusy(false);
  };
  const parts = checked.split(URL_RE);
  return (
    <div className="app-screen messages-x">
      <h1 className="large-title">{P.msgTitle}</h1>
      <p className="lead">{t.msgHint}</p>
      <textarea id="msg-text" className="field-x" rows="4" value={text} placeholder={t.msgPlaceholder}
        onChange={(e) => { setText(e.target.value); setRes(null); setChecked(""); }} />
      <div className="chips-x">
        {boot.samples.map((s, i) => <button key={i} onClick={() => { setText(s[lang]); run(s[lang]); }}>{t.msgSample[i]}</button>)}
      </div>
      {checked && (
        <div className="bubble them big">
          {parts.map((p, i) => (i % 2 ? <mark key={i} title={P.msgLinks}>{p}</mark> : <span key={i}>{p}</span>))}
        </div>
      )}
      {busy && <p className="empty">{t.msgChecking}</p>}
      {res && !res.error && (
        <section className={"verdict " + { scam: "bad", suspicious: "warn", safe: "ok" }[res.verdict]}>
          <b><Icon name={res.verdict === "safe" ? "shield" : "alert"} size={20} />{t.verdict[res.verdict]}</b>
          {res.reasons.length > 0 && <ul>{res.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <p>{res.advice}</p>
          <small>{t.msgBy[res.source]}</small>
        </section>
      )}
      {res?.error && <p className="error">{res.error}</p>}
      <div className="cta-stack"><button className="btn primary-blue" disabled={!text.trim() || busy} onClick={() => run()}>{t.msgCheck}</button></div>
    </div>
  );
}
