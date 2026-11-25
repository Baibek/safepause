import React, { useEffect, useRef, useState } from "react";
import { setSessionPersona, api, fmt } from "./i18n.js";
import CallGuard, { CALL_T } from "./call/CallGuard.jsx";
import VerifyCall from "./phone/VerifyCall.jsx";
import ProtectScreen from "./phone/ProtectScreen.jsx";
import { Icon } from "./phone/PhoneFrame.jsx";
import { isOtherBank } from "./transfer/TransferSection.jsx";
import TransferSection from "./transfer/TransferSection.jsx";
import PhoneFrame, { TabBar } from "./phone/PhoneFrame.jsx";
import { PH } from "./phone/strings.js";
import { HomeScreen, AnalysisScreen, WarningScreen, DialogScreen, ResultScreen, GuardianScreen, HistoryScreen, MessagesScreen, TxRow, IndexRing } from "./phone/screens.jsx";
import { SH, SCEN_ORDER } from "./shell.js";
import { STAGES } from "./call/detector.js";

const PRESETS = {
  pNormal: { persona: "aigul", recipient: "family", amount: 15000, on_call: false, unknown_caller: false, remote_app: false, night: false, pace: 45 },
  pScam: { persona: "aigul", recipient: "new_drop", amount: 1800000, on_call: true, unknown_caller: true, remote_app: false, night: false, pace: 180 },
  pRemote: { persona: "aigul", recipient: "new_drop", amount: 2000000, on_call: true, unknown_caller: true, remote_app: true, night: true, pace: 8 },
  pCoached: { persona: "daniyar", recipient: "new_clean", amount: 600000, on_call: true, unknown_caller: true, remote_app: false, night: false, pace: 180 },
  pBig: { persona: "aigul", recipient: "family", amount: 150000, on_call: false, unknown_caller: false, remote_app: false, night: false, pace: 45 },
  pOtherBank: { persona: "daniyar", recipient: "new_clean", amount: 90000, on_call: false, unknown_caller: false, remote_app: false, night: false, pace: 45 },
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

function CallPanel({ state, lang, t }) {
  const ct = CALL_T[lang];
  const a = state?.assessment;
  const level = state?.level || "LOW";
  const stageName = { AUTHORITY: t.stAuth, THREAT: t.stThreat, REQUEST: t.stRequest, ISOLATION: t.stIso };
  return (
    <div>
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

export default function Client({ boot, lang, t, scenOpen = false, setScenOpen = () => {} }) {
  const [sc, setSc] = useState(PRESETS.pScam);
  // phone app navigation: a tab, and inside "transfer" the step of the flow
  const [tab, setTab] = useState("home");          // home | transfer | call | messages | history | guardian
  const [flow, setFlow] = useState("form");        // form | analysis | warning | dialog | result
  const [check, setCheck] = useState(null);
  const [chat, setChat] = useState([]);
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState([]);
  const [spent, setSpent] = useState({});
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tStep, setTStep] = useState("menu");
  const [prot, setProt] = useState(null);   // the client's protection settings, for the trusted-contact screen
  useEffect(() => { if (tab === "guardian" || tab === "protect" || tab === "home") api(`/api/protect/${sc.persona}`).then(setProt).catch(() => {}); }, [tab, sc.persona, final]); // transfers section: menu of transfer types | form
  const P = PH[lang];
  const [callState, setCallState] = useState(null);
  const [scamCallAt, setScamCallAt] = useState(null);   // set when Call Guard flags a call: the bank app pauses transfers for an hour
  useEffect(() => {
    if (callState?.screen === "summary" && callState.level === "HIGH") setScamCallAt((at) => at ?? Date.now());
  }, [callState?.screen, callState?.level]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  const scamCallMinutes = scamCallAt && now - scamCallAt <= 3600_000 ? Math.max(0, (now - scamCallAt) / 60000) : null;

  const persona = boot.personas.find((p) => p.id === sc.persona);
  setSessionPersona(sc.persona);   // the server session acts for the client chosen in the scenario panel
  const rec = boot.recipients.find((r) => r.id === sc.recipient);
  const balance = persona.balance - (spent[persona.id] || 0);
  const set = (patch) => setSc((s) => ({ ...s, ...patch }));

  const loadNotes = () => api("/api/guardian/notifications").then(setNotes).catch(() => {});
  useEffect(() => { loadNotes(); const i = setInterval(loadNotes, 3000); return () => clearInterval(i); }, []);
  // the client's own transfers, newest first, from the same feed the analyst sees
  const loadHistory = () => {
    setHistoryLoading(true);
    return api(`/api/client/history/${persona.id}`)
      .then(setHistory)
      .catch(() => {}).finally(() => setHistoryLoading(false));
  };
  useEffect(() => { loadHistory(); }, [tab, persona.name, final, check]);   // the board lists them on every screen

  const resetFlow = () => { setFlow("form"); setCheck(null); setChat([]); setFinal(null); setErr(""); setBusy(false); };
  const [protectView, setProtectView] = useState("main");
  const [protectNonce, setProtectNonce] = useState(0);   // tapping the tab again returns to the section's start
  // Call Status push: when the bank really calls this client, the app says so on any screen (Monzo-style)
  const [bankCall, setBankCall] = useState(null);
  const [bankSeen, setBankSeen] = useState("");
  useEffect(() => {
    const poll = () => api(`/api/callstatus/${sc.persona}`).then((r) => setBankCall(r.active ? r.staff : null)).catch(() => {});
    poll(); const i = setInterval(poll, 3000);
    return () => clearInterval(i);
  }, [sc.persona]);
  const go = (to) => {
    if (to === "transfer") { resetFlow(); setTStep("menu"); }
    if (to === "bankcall") { setProtectView("call"); setProtectNonce((n) => n + 1); setTab("protect"); return; }   // "Is this really the bank?"
    if (to === "protect") { setProtectView("main"); setProtectNonce((n) => n + 1); }
    setTab(to);
  };
  const goHome = () => { resetFlow(); setTStep("menu"); setTab("home"); };
  const applyPreset = (k) => { resetFlow(); setTab("transfer"); setTStep("form"); setSc({ ttype: "phone", ...PRESETS[k] }); };
  const mode = tab === "call" ? "call" : tab === "messages" ? "message" : "transfer";
  const addSpent = () => setSpent((s) => ({ ...s, [sc.persona]: (s[sc.persona] || 0) + Number(sc.amount) }));

  const send = async () => {
    setErr(""); setCheck(null); setFinal(null); setChat([]); setFlow("analysis");
    try {
      const [res] = await Promise.all([
        api("/api/transfer/check", {
          persona: sc.persona, recipient_id: sc.recipient, amount: Number(sc.amount), lang,
          other_bank: isOtherBank(sc.recipient, sc.ttype),
          signals: { on_call: sc.on_call, unknown_caller: sc.unknown_caller, remote_app: sc.remote_app,
            hour: sc.night ? 2 : null, session_seconds: sc.pace, scam_call_minutes: scamCallMinutes,
            new_device: Boolean(sc.new_device), vpn: Boolean(sc.vpn), loan_minutes_ago: sc.loan ? 5 : null,
            pasted: Boolean(sc.pasted), typing_pause_ms: sc.typing_pause_ms || null, typing_median_ms: sc.typing_median_ms || null,
            app_switches: sc.app_switches || 0, phone_flat: Boolean(sc.phone_flat), corrections: sc.corrections || 0 },
          recipient_name: sc.recipient_name || null,
        }),
        new Promise((r) => setTimeout(r, 1100)),   // let the scan read as a scan
      ]);
      setCheck(res);
      if (res.action === "approve") addSpent();    // approved by the bank already: the analysis screen shows it
    } catch (e) { setErr(String(e.message)); setFlow("form"); }
  };

  // the client's decision on the warning screen, or an answer to the assistant's question
  const answer = async (value, shown) => {
    if (busy || !value) return;
    setBusy(true);
    if (shown) setChat((c) => [...c, { from: "client", text: shown }]);
    try {
      const res = await api("/api/dialog/answer", { tx_id: check.tx_id, answer: value, lang });
      const add = [];
      if (res.message) add.push({ from: "bot", text: res.message });
      if (res.question && !res.final) add.push({ from: "bot", text: res.question.text });
      setChat((c) => [...c, ...add]);
      if (res.final) {
        setFinal(res.final);
        if (res.final.decision === "approved") addSpent();
        loadNotes();
      }
      return res;
    } catch (e) { setChat((c) => [...c, { from: "bot", text: String(e.message) }]); setErr(String(e.message)); }
    finally { setBusy(false); }
  };
  // the bank's verification call: 1 = made by the client -> sent; 2 = not them -> blocked; no answer -> postponed
  const verifyAnswer = async (value) => {
    try {
      const res = await api("/api/verify/respond", { tx_id: check.tx_id, answer: value, lang });
      setFinal({ ...res.final, message: res.message });
      if (res.final.decision === "approved") addSpent();
      loadNotes(); loadHistory();
    } catch (e) { setFinal({ decision: "delayed", delay_minutes: 60, message: String(e.message) }); }
    setFlow("result");
  };
  const decide = async (value) => { const r = await answer(value, null); if (r?.final) setFlow("result"); };
  const openDialog = () => {
    setChat([{ from: "bot", text: check.message }, { from: "bot", text: check.question.text }]);
    setFlow("dialog");
  };

  const guardian = async (id, action) => { await api("/api/guardian/respond", { id, action }); loadNotes(); };

  const phone = (() => {
          const inCall = tab === "call" && callState && callState.screen === "call";
          const callPill = inCall ? { key: "guard", label: P.tabs.call }
            : tab === "transfer" && flow === "verify" ? { key: "verify", label: P.verify.caller.split(" · ")[0] }
            : tab === "transfer" && sc.on_call ? { key: "transfer", label: sc.unknown_caller ? "+7 7•• •••" : P.tabs.call } : null;
          const showTabs = (tab === "transfer" ? flow === "form" && tStep === "menu" : tab === "call" ? !callState || callState.screen === "pick" : true);
          const darkScreen = (tab === "call" && callState && callState.screen !== "pick" && callState.screen !== "summary")
            || (tab === "transfer" && flow === "verify");
          const recName = rec ? rec.name[lang] : "";
          const note = check && notes.find((n) => n.tx_id === check.tx_id);
          const tabs = [
            { id: "home", icon: "home", label: P.tabs.home }, { id: "transfer", icon: "send", label: P.tabs.transfer },
            { id: "call", icon: "phone", label: P.tabs.call }, { id: "messages", icon: "message", label: P.tabs.messages },
            { id: "protect", icon: "shield", label: P.tabs.protect },
          ];
          const callAlert = scamCallMinutes != null && (
            <div className="call-alert-x" role="status">
              <b>{t.callAlert(Math.round(scamCallMinutes))}</b>
              <span>{t.callAlertSub}</span>
              <button className="link-btn" onClick={() => setScamCallAt(null)}>{t.callAlertOk}</button>
            </div>
          );
          let screenNode, key;
          if (tab === "home") {
            key = "home";
            screenNode = <HomeScreen persona={persona} balance={balance} P={P} t={t} history={history} scamCallMinutes={scamCallMinutes}
              onDismissCall={() => setScamCallAt(null)} go={go} prot={prot} />;
          } else if (tab === "history") {
            key = "history"; screenNode = <HistoryScreen history={history} P={P} loading={historyLoading} onBack={() => setTab("home")} />;
          } else if (tab === "guardian") {
            key = "guardian";
            screenNode = <GuardianScreen persona={persona} notes={notes} P={P} t={t} lang={lang} onRespond={guardian} trusted={prot?.persona === persona.id ? prot.trusted : undefined} />;
          } else if (tab === "protect") {
            key = "protect-" + protectNonce;
            screenNode = <ProtectScreen persona={persona} P={P} lang={lang} onApprovals={() => setTab("guardian")} onChange={setProt} initial={protectView} />;
          } else if (tab === "messages") {
            key = "messages"; screenNode = <MessagesScreen boot={boot} lang={lang} t={t} P={P} />;
          } else if (tab === "call") {
            key = "call"; screenNode = <div className="call-host"><CallGuard lang={lang} onState={setCallState} persona={sc.persona} staff={boot.staff || []} /></div>;
          } else if (flow === "analysis") {
            key = "analysis";
            screenNode = <AnalysisScreen check={check} P={P} lang={lang} amount={Number(sc.amount)}
              onLow={() => { setFinal({ decision: "approved" }); setFlow("result"); }} onRisk={() => setFlow("warning")} onVerify={() => setFlow("verify")}
              onCooling={() => { setFinal({ decision: "delayed", delay_minutes: check.cooling.minutes, message: check.message }); setFlow("result"); loadHistory(); }} />;
          } else if (flow === "verify" && check?.verify) {
            key = "verify";
            screenNode = <VerifyCall check={check} amount={Number(sc.amount)} recipient={recName} lang={lang} P={P} onAnswer={verifyAnswer} />;
          } else if (flow === "warning" && check) {
            key = "warning";
            screenNode = <WarningScreen check={check} P={P} lang={lang} busy={busy}
              onCancel={() => decide("cancel")} onDelay={() => decide("delay")} onProceed={openDialog} />;
          } else if (flow === "dialog") {
            key = "dialog";
            screenNode = <DialogScreen P={P} t={t} amount={Number(sc.amount)} chat={chat} busy={busy} final={final}
              onAnswer={answer} onResult={() => setFlow("result")} />;
          } else if (flow === "result" && final) {
            key = "result";
            screenNode = <ResultScreen final={final} P={P} t={t} recipientName={recName} amount={Number(sc.amount)} check={check} note={note}
              onHome={goHome} onGuardian={() => setTab("guardian")} />;
          } else {
            key = "transfer-" + tStep;
            screenNode = <TransferSection step={tStep} setStep={setTStep} boot={boot} lang={lang} t={t} P={P} balance={balance}
              sc={sc} set={set} onSend={send} err={err} alert={callAlert} />;
          }
          const tone = darkScreen || key === "warning" ? "light" : "dark";
          return (
            <PhoneFrame tone={tone} call={callPill}
              tabBar={showTabs && <TabBar tabs={tabs} active={tab === "guardian" ? "protect" : tab === "history" ? "home" : tab} onChange={go} />}>
              {bankCall && tab !== "call" && bankSeen !== bankCall.since && (
                <div className="push-banner" role="status">
                  <span className="pb-ic"><Icon name="phone" size={16} stroke={2.4} /></span>
                  <div><small>Senim · {P.push.now}</small><b>{P.push.title}</b><span>{P.push.body(bankCall.name, bankCall.id)}</span></div>
                  <button onClick={() => setBankSeen(bankCall.since)} aria-label={P.push.close}><Icon name="close" size={14} stroke={2.4} /></button>
                </div>
              )}
              <div className={"screen-slot" + (key === "warning" ? " warn-bg" : darkScreen ? " dark-bg" : "")} key={key}>{screenNode}</div>
            </PhoneFrame>
          );
  })();

  const S = SH[lang];
  const navActive = tab === "guardian" ? "protect" : tab === "protect" && protectView === "call" ? "bankcall" : tab;
  const NAV = [["home", "home"], ["transfer", "send"], ["call", "phone"], ["messages", "message"], ["protect", "shield"], ["history", "clock"], ["bankcall", "bank"]];
  const idx = prot?.persona === persona.id ? prot : null;
  const idxRows = [["passkey", Boolean(idx?.passkey_device)], ["trusted", idx?.trusted?.state === "active"], ["locked", (idx?.locked || 0) > 0]];
  const runScen = (s) => { setScenOpen(false); if (s.go) go(s.go); else applyPreset(s.id); };

  return (
    <>
      <div className="shell">
        <aside className="snav">
          <nav aria-label={S.phoneCap}>
            {NAV.map(([id, icon]) => (
              <button key={id} className={(navActive === id ? "on" : "") + (id === "bankcall" ? " hot" : "")} aria-current={navActive === id ? "page" : undefined} onClick={() => go(id)}>
                <Icon name={icon} size={20} stroke={1.9} /><span>{S.nav[id]}</span>
              </button>
            ))}
          </nav>
          <p className="snav-note">{S.navNote}</p>
          <div className="snav-card">
            <small>{S.who}</small>
            <div className="persona-pick">
              {boot.personas.map((p) => (
                <button key={p.id} className={sc.persona === p.id ? "on" : ""} onClick={() => { goHome(); set({ persona: p.id }); }}>
                  <span className="pp-av">{p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                  <span><b>{p.name.split(" ")[0]}</b><small>{p.age} {S.years}</small></span>
                </button>
              ))}
            </div>
            <p className="hint small">{persona.guardian ? S.guardian(persona.guardian.name, persona.guardian.relation[lang]) : S.noGuardian}</p>
          </div>
        </aside>

        <main className="board">
          <header className="board-head">
            <span className="bh-av">{persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
            <div className="bh-name"><h1>{persona.name}</h1><p>{S.sub}</p></div>
            <div className="bh-bal"><small>{S.available}</small><b>{fmt(balance - (idx?.locked || 0))} ₸</b></div>
          </header>

          <div className="board-grid">
            <section className="bcard b-index">
              <div className="bi-ring"><IndexRing value={idx?.index ?? 0} size={112} stroke={10} /><small>{S.indexOf}</small></div>
              <div className="bi-body">
                <h2>{S.indexTitle}</h2>
                <ul>{idxRows.map(([k, on]) => <li key={k} className={on ? "on" : ""}><i />{S.idx[k]}<small>{on ? S.idxOn : S.idxOff}</small></li>)}</ul>
                <button className="link-btn" onClick={() => go("protect")}>{S.idxOpen}</button>
              </div>
            </section>

            <section className="bcard b-risk">
              {mode === "call" ? <CallPanel state={callState} lang={lang} t={t} /> : (
                <>
                  <h2>{t.under}</h2>
                  {check ? (
                    <>
                      <div className="risk-row"><span>{t.risk}</span><RiskBadge risk={check.risk} level={check.level} t={t} /></div>
                      <div className="meter"><i className={check.level} style={{ width: `${Math.max(check.risk * 100, 2)}%` }} />
                        <em style={{ left: `${boot.thresholds.pause * 100}%` }} /><em style={{ left: `${boot.thresholds.high * 100}%` }} /></div>
                      <Factors factors={check.factors} lang={lang} t={t} />
                    </>
                  ) : <p className="hint">{t.underEmpty}</p>}
                </>
              )}
            </section>

            <section className="bcard b-signals">
              {mode === "call" ? (
                <>
                  <h2>{t.callHowTitle}</h2>
                  <ol className="how">{t.callHow.map((x, i) => <li key={i}>{x}</li>)}</ol>
                  <p className="hint">{t.callPrivacy}</p>
                </>
              ) : (
                <>
                  <h2>{S.signals}</h2>
                  <p className="hint">{t.scenarioHint}</p>
                  <div className="sig-grid">
                    <div>
                      <label className="check"><input type="checkbox" checked={sc.on_call} onChange={(e) => set({ on_call: e.target.checked, unknown_caller: e.target.checked && sc.unknown_caller })} />{t.sigCall}</label>
                      <label className="check sub"><input type="checkbox" disabled={!sc.on_call} checked={sc.unknown_caller} onChange={(e) => set({ unknown_caller: e.target.checked })} />{t.sigUnknown}</label>
                      <label className="check"><input type="checkbox" checked={sc.remote_app} onChange={(e) => set({ remote_app: e.target.checked })} />{t.sigRemote}</label>
                      <label className="check"><input type="checkbox" checked={Boolean(sc.new_device)} onChange={(e) => set({ new_device: e.target.checked, loan: e.target.checked && sc.loan })} />{t.sigNewDevice}</label>
                      <label className="check sub"><input type="checkbox" disabled={!sc.new_device} checked={Boolean(sc.loan)} onChange={(e) => set({ loan: e.target.checked })} />{t.sigLoan}</label>
                      <label className="check"><input type="checkbox" checked={Boolean(sc.vpn)} onChange={(e) => set({ vpn: e.target.checked })} />{t.sigVpn}</label>
                    </div>
                    <div>
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
                      <p className="hint behavior">{t.behavior(Boolean(sc.pasted), (sc.typing_pause_ms || 0) / 1000)}</p>
                      <p className="hint behavior">{t.behavior2(sc.typing_median_ms || 0, boot.behavior?.[sc.persona]?.typing_ms || 0, sc.app_switches || 0, sc.corrections || 0)}</p>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="bcard b-guardian">
              <h2>{t.guardianPhone}</h2>
              {notes.length === 0 && <p className="hint">{t.guardianEmpty}</p>}
              {notes.map((n) => (
                <div key={n.id} className={"note " + n.state}>
                  <small>Senim · {n.time.slice(11, 16)}</small>
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
            </section>

            <section className="bcard b-ops">
              <div className="bc-head"><h2>{S.ops}</h2>{history.length > 0 && <button className="link-btn" onClick={() => go("history")}>{S.opsAll}</button>}</div>
              {history.length ? <ul className="ops-list">{history.slice(0, 6).map((tx) => <TxRow key={tx.id} tx={tx} P={P} />)}</ul>
                : <p className="hint">{S.opsEmpty}</p>}
            </section>
          </div>
        </main>

        <section className="sphone" aria-label={S.phoneCap}>
          <div className="sphone-cap"><b>{S.phoneCap}</b><small>{S.phoneHint}</small></div>
          {phone}
        </section>
      </div>

      {scenOpen && (
        <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) setScenOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="scen-title">
            <div className="modal-head">
              <div><h2 id="scen-title">{S.scenTitle}</h2><p>{S.scenLead}</p></div>
              <button className="modal-x" onClick={() => setScenOpen(false)} aria-label={S.close}><Icon name="close" size={18} stroke={2.2} /></button>
            </div>
            <ul className="scen-list">
              {SCEN_ORDER.map((s) => {
                const [title, desc] = s.go ? S.scen[s.id] : [t[s.id], S.scen[s.id]];
                return (
                  <li key={s.id}><button onClick={() => runScen(s)}><i className={"dot " + s.tone} /><span><b>{title}</b><small>{desc}</small></span></button></li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
