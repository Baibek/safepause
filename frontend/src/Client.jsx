import React, { useEffect, useRef, useState } from "react";
import { api, fmt } from "./i18n.js";
import CallGuard, { CALL_T } from "./call/CallGuard.jsx";
import TransferSection from "./transfer/TransferSection.jsx";
import { STAGES } from "./call/detector.js";

const PRESETS = {
  pNormal: { persona: "aigul", recipient: "family", amount: 15000, on_call: false, unknown_caller: false, remote_app: false, night: false, pace: 45 },
  pScam: { persona: "aigul", recipient: "new_drop", amount: 1800000, on_call: true, unknown_caller: true, remote_app: false, night: false, pace: 180 },
  pRemote: { persona: "aigul", recipient: "new_drop", amount: 2300000, on_call: true, unknown_caller: true, remote_app: true, night: true, pace: 8 },
  pCoached: { persona: "daniyar", recipient: "new_clean", amount: 600000, on_call: true, unknown_caller: true, remote_app: false, night: false, pace: 180 },
};

export function Factors({ factors, lang, t }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.01);
  return (
    <ul className="factors">
      {factors.map((f) => (
        <li key={f.key}>
          <span className="f-text">{f[lang]}</span>
          <span className="f-bar" title={`${f.contribution > 0 ? "+" : ""}${f.contribution} · ${f.contribution > 0 ? t.raises : t.lowers}`}>
            <i className={f.contribution > 0 ? "up" : "down"} style={{ width: `${(Math.abs(f.contribution) / max) * 100}%` }} />
          </span>
          <span className="f-val">{f.contribution > 0 ? "+" : "−"}{Math.abs(f.contribution).toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

export function RiskBadge({ risk, level, t }) {
  return <span className={"risk " + level}>{Math.round(risk * 100)}% · {t[level]}</span>;
}

function Messages({ boot, lang, t }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (value = text) => {
    if (!value.trim() || busy) return;
    setBusy(true); setRes(null);
    try { setRes(await api("/api/message/check", { text: value, lang })); } catch (e) { setRes({ error: String(e.message) }); }
    setBusy(false);
  };
  return (
    <div className="screen">
      <h4 className="first">{t.msgTitle}</h4>
      <p className="hint">{t.msgHint}</p>
      <textarea id="msg-text" className="msg-input" rows="5" value={text} placeholder={t.msgPlaceholder}
        onChange={(e) => { setText(e.target.value); setRes(null); }} />
      <span className="lbl">{t.msgSamples}</span>
      <div className="chips">
        {boot.samples.map((s, i) => (
          <button key={i} onClick={() => { setText(s[lang]); run(s[lang]); }}>{t.msgSample[i]}</button>
        ))}
      </div>
      {busy && <p className="hint">{t.msgChecking}</p>}
      {res && !res.error && (
        <div className={"outcome " + { scam: "cancelled", suspicious: "delayed", safe: "approved" }[res.verdict]}>
          <b>{t.verdict[res.verdict]}</b>
          {res.reasons.length > 0 && <ul>{res.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <span>{res.advice}</span>
          <span className="tag">{t.msgBy[res.source]}</span>
        </div>
      )}
      {res?.error && <p className="error">{res.error}</p>}
      <button className="primary" disabled={!text.trim() || busy} onClick={() => run()}>{t.msgCheck}</button>
    </div>
  );
}

function CallPanel({ state, lang, t }) {
  const ct = CALL_T[lang];
  const a = state?.assessment;
  const level = state?.level || "LOW";
  const stageName = { AUTHORITY: t.stAuth, THREAT: t.stThreat, REQUEST: t.stRequest, ISOLATION: t.stIso };
  return (
    <div className="panel">
      <h2>{t.callUnder}</h2>
      <p className="hint">{t.callHint}</p>
      <div className="risk-row"><span>{t.risk}</span><span className={"risk " + level.toLowerCase()}>{ct.lv[level]}</span></div>
      <div className="stages">
        {STAGES.map((st) => <span key={st} className={"stage" + (a?.stages.has(st) ? " on" : "")}>{stageName[st]}</span>)}
      </div>
      {a && a.hits.length > 0 ? (
        <ul className="hits">
          {a.hits.map((h) => (
            <li key={h.rule.id}><b>{h.rule[lang]}</b><small>«{h.phrase.text}»{h.rule.critical ? " · " + t.critical : ""}</small></li>
          ))}
        </ul>
      ) : <p className="hint">{t.callEmpty}</p>}
      {state?.llm && <p className="hint"><b>{ct.claude}:</b> {state.llm.reasons.join("; ")}</p>}
      <p className="hint small">{t.callRule}</p>
    </div>
  );
}

export default function Client({ boot, lang, t }) {
  const [sc, setSc] = useState(PRESETS.pScam);
  const [screen, setScreen] = useState("home"); // home | checking | dialog | result
  const [check, setCheck] = useState(null);
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState(null);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState([]);
  const [spent, setSpent] = useState({});
  const [mode, setMode] = useState("call"); // call | transfer | message
  const [tStep, setTStep] = useState("menu"); // transfers section: menu of transfer types | form
  const [callState, setCallState] = useState(null);
  const [scamCallAt, setScamCallAt] = useState(null);   // set when Call Guard flags a call: the bank app pauses transfers for an hour
  useEffect(() => {
    if (callState?.screen === "summary" && callState.level === "HIGH") setScamCallAt((at) => at ?? Date.now());
  }, [callState?.screen, callState?.level]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  const scamCallMinutes = scamCallAt && now - scamCallAt <= 3600_000 ? Math.max(0, (now - scamCallAt) / 60000) : null;
  const chatEnd = useRef(null);

  const persona = boot.personas.find((p) => p.id === sc.persona);
  const rec = boot.recipients.find((r) => r.id === sc.recipient);
  const balance = persona.balance - (spent[persona.id] || 0);
  const set = (patch) => setSc((s) => ({ ...s, ...patch }));

  const loadNotes = () => api("/api/guardian/notifications").then(setNotes).catch(() => {});
  useEffect(() => { loadNotes(); const i = setInterval(loadNotes, 3000); return () => clearInterval(i); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, busy]);

  const home = () => { setScreen("home"); setCheck(null); setChat([]); setQuestion(null); setFinal(null); setErr(""); };
  const applyPreset = (k) => { home(); setMode("transfer"); setTStep("form"); setSc({ ttype: "phone", ...PRESETS[k] }); };

  const send = async () => {
    setErr(""); setScreen("checking");
    try {
      const [res] = await Promise.all([
        api("/api/transfer/check", {
          persona: sc.persona, recipient_id: sc.recipient, amount: Number(sc.amount), lang,
          signals: { on_call: sc.on_call, unknown_caller: sc.unknown_caller, remote_app: sc.remote_app,
            hour: sc.night ? 2 : null, session_seconds: sc.pace, scam_call_minutes: scamCallMinutes },
        }),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      setCheck(res);
      if (res.action === "approve") {
        setFinal({ decision: "approved" });
        setSpent((s) => ({ ...s, [sc.persona]: (s[sc.persona] || 0) + Number(sc.amount) }));
        setScreen("result");
      } else {
        setChat([{ from: "bot", text: res.message }, { from: "bot", text: res.question.text }]);
        setQuestion(res.question); setScreen("dialog");
      }
    } catch (e) { setErr(String(e.message)); setScreen("home"); }
  };

  const answer = async (value, shown) => {
    if (busy || !value) return;
    setBusy(true); setText("");
    setChat((c) => [...c, { from: "client", text: shown }]);
    try {
      const res = await api("/api/dialog/answer", { tx_id: check.tx_id, answer: value, lang });
      const add = [];
      if (res.message) add.push({ from: "bot", text: res.message });
      if (res.question && !res.final) add.push({ from: "bot", text: res.question.text });
      setChat((c) => [...c, ...add]);
      setQuestion(res.final ? null : res.question || question);
      if (res.final) {
        setFinal(res.final);
        if (res.final.decision === "approved") setSpent((s) => ({ ...s, [sc.persona]: (s[sc.persona] || 0) + Number(sc.amount) }));
        loadNotes();
      }
    } catch (e) { setChat((c) => [...c, { from: "bot", text: String(e.message) }]); }
    setBusy(false);
  };

  const guardian = async (id, action) => { await api("/api/guardian/respond", { id, action }); loadNotes(); };

  return (
    <main className="client-view">
      {mode === "call" && (
        <section className="panel scenario">
          <h2>{t.callHowTitle}</h2>
          <ol className="how">{t.callHow.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <p className="hint">{t.callPrivacy}</p>
        </section>
      )}
      <section className="panel scenario" hidden={mode === "call"}>
        <h2>{t.scenario}</h2>
        <p className="hint">{t.scenarioHint}</p>
        <h3>{t.presets}</h3>
        <div className="presets">
          {Object.keys(PRESETS).map((k) => (
            <button key={k} className={sc === PRESETS[k] ? "on" : ""} onClick={() => applyPreset(k)}>{t[k]}</button>
          ))}
        </div>
        <h3>{t.client}</h3>
        <div className="seg">
          {boot.personas.map((p) => (
            <button key={p.id} className={sc.persona === p.id ? "on" : ""} onClick={() => { home(); set({ persona: p.id }); }}>
              {p.name.split(" ")[0]}, {p.age} {t.years}
            </button>
          ))}
        </div>
        <p className="hint">{persona.guardian ? `${t.guardianOn}: ${persona.guardian.name} (${persona.guardian.relation[lang]})` : t.guardianOff}</p>
        <label className="check"><input type="checkbox" checked={sc.on_call} onChange={(e) => set({ on_call: e.target.checked, unknown_caller: e.target.checked && sc.unknown_caller })} />{t.sigCall}</label>
        <label className="check sub"><input type="checkbox" disabled={!sc.on_call} checked={sc.unknown_caller} onChange={(e) => set({ unknown_caller: e.target.checked })} />{t.sigUnknown}</label>
        <label className="check"><input type="checkbox" checked={sc.remote_app} onChange={(e) => set({ remote_app: e.target.checked })} />{t.sigRemote}</label>
        <label className="field">{t.sigTime}
          <select value={sc.night ? "1" : "0"} onChange={(e) => set({ night: e.target.value === "1" })}>
            <option value="0">{t.timeNow}</option><option value="1">{t.timeNight}</option>
          </select>
        </label>
        <label className="field">{t.sigPace}
          <select value={sc.pace} onChange={(e) => set({ pace: Number(e.target.value) })}>
            <option value="45">{t.paceNormal}</option><option value="180">{t.paceSlow}</option><option value="8">{t.paceFast}</option>
          </select>
        </label>
      </section>

      <section className="phone-wrap">
        <div className="phone">
          <div className="notch" />
          {mode === "transfer" && sc.on_call && <div className="callbar">● {t.sigCall}{sc.unknown_caller ? " · +7 7•• ••• •• ••" : ""}</div>}
          {mode === "call" && <CallGuard lang={lang} onState={setCallState} />}
          {mode === "message" && <Messages boot={boot} lang={lang} t={t} />}
          {mode === "transfer" && screen === "home" && (
            <TransferSection step={tStep} setStep={setTStep} boot={boot} lang={lang} t={t} persona={persona} balance={balance}
              sc={sc} set={set} onSend={send} err={err}
              alert={scamCallMinutes != null && (
                <div className="call-alert" role="status">
                  <b>⚠ {t.callAlert(Math.round(scamCallMinutes))}</b>
                  <span>{t.callAlertSub}</span>
                  <button onClick={() => setScamCallAt(null)}>{t.callAlertOk}</button>
                </div>
              )} />
          )}
          {mode === "transfer" && screen === "checking" && (
            <div className="screen center"><div className="pulse"><i /><i /></div><p>{t.checking}</p></div>
          )}
          {mode === "transfer" && screen === "dialog" && (
            <div className="screen dialog">
              <div className="dlg-head">
                <span className="logo sm" aria-hidden="true"><i /><i /></span>
                <div><b>{t.assistant}</b><small>{t.paused} · {fmt(sc.amount)} ₸</small></div>
              </div>
              <div className="chat">
                {chat.map((m, i) => <div key={i} className={"msg " + m.from}>{m.text}</div>)}
                {busy && <div className="msg bot typing"><i /><i /><i /></div>}
                {final && (
                  <div className={"outcome " + final.decision}>
                    <b>{final.decision === "approved" ? t.rApproved : final.decision === "cancelled" ? t.rCancelled : t.rDelayed}</b>
                    {final.decision === "delayed" && <span>{t.rDelayedSub(final.delay_minutes)}</span>}
                    {final.decision === "cancelled" && <span>{t.rCancelledSub}</span>}
                    {final.guardian_notified && <span className="tag">{t.guardianBadge}</span>}
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              {!final ? (
                <div className="reply">
                  <div className="yn">
                    <button disabled={busy} onClick={() => answer("yes", t.yes)}>{t.yes}</button>
                    <button disabled={busy} onClick={() => answer("no", t.no)}>{t.no}</button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); answer(text.trim(), text.trim()); }}>
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.typeAnswer} />
                    <button disabled={busy || !text.trim()} aria-label="send">➜</button>
                  </form>
                </div>
              ) : <button className="primary" onClick={home}>{t.again}</button>}
            </div>
          )}
          {mode === "transfer" && screen === "result" && (
            <div className="screen center">
              <div className="tick">✓</div>
              <h4>{t.rApproved}</h4>
              <p>{fmt(sc.amount)} ₸ → {rec.name[lang]}</p>
              <button className="primary" onClick={home}>{t.again}</button>
            </div>
          )}
          {(mode === "message" || (mode === "transfer" && screen === "home" && tStep === "menu") || (mode === "call" && (!callState || callState.screen === "pick"))) && (
            <nav className="phone-tabs three">
              <button className={mode === "call" ? "on" : ""} onClick={() => setMode("call")}>{t.tabCall}</button>
              <button className={mode === "transfer" ? "on" : ""} onClick={() => setMode("transfer")}>{t.tabTransfer}</button>
              <button className={mode === "message" ? "on" : ""} onClick={() => setMode("message")}>{t.tabMessage}</button>
            </nav>
          )}
        </div>
      </section>

      <section className="side">
        {mode === "call" && <CallPanel state={callState} lang={lang} t={t} />}
        <div className="panel" hidden={mode === "call"}>
          <h2>{t.under}</h2>
          {check ? (
            <>
              <div className="risk-row"><span>{t.risk}</span><RiskBadge risk={check.risk} level={check.level} t={t} /></div>
              <div className="meter"><i className={check.level} style={{ width: `${Math.max(check.risk * 100, 2)}%` }} />
                <em style={{ left: `${boot.thresholds.pause * 100}%` }} /><em style={{ left: `${boot.thresholds.high * 100}%` }} /></div>
              <Factors factors={check.factors} lang={lang} t={t} />
            </>
          ) : <p className="hint">{t.underEmpty}</p>}
        </div>
        <div className="panel guardian">
          <h2>{t.guardianPhone}</h2>
          {notes.length === 0 && <p className="hint">{t.guardianEmpty}</p>}
          {notes.map((n) => (
            <div key={n.id} className={"note " + n.state}>
              <small>SafePause · {n.time.slice(11, 16)}</small>
              <p>{t.gText(n)}</p>
              <b>{t.gState[n.state]}</b>
              {n.state === "open" && (
                <div className="yn">
                  <button onClick={() => guardian(n.id, "stop")}>{t.gStop}</button>
                  <button className="quiet" onClick={() => guardian(n.id, "confirm")}>{t.gConfirm}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
