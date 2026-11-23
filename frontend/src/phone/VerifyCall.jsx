import React, { useEffect, useRef, useState } from "react";
import { fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";
import { loadCall, playTurn, speak, stopSpeaking } from "../call/speech.js";

/**
 * The bank's verification call. Before an unusual transfer leaves, the bank's robot calls the client, reads a short
 * notice about scams (recorded with a Piper voice) and asks to press 1 if they are making the transfer themselves,
 * or 2 if not. Declining the call counts as no answer. The chosen answer is handed to onAnswer.
 */
export default function VerifyCall({ check, amount, recipient, lang, P, onAnswer }) {
  const V = P.verify;
  const [stage, setStage] = useState("ring");      // ring | call
  const [line, setLine] = useState(-1);
  const [secs, setSecs] = useState(0);
  const [sent, setSent] = useState(false);
  const run = useRef(0);
  const script = check.verify.script;

  useEffect(() => () => { run.current++; stopSpeaking(); }, []);
  useEffect(() => {
    if (stage !== "call") return;
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [stage]);

  const accept = async () => {
    setStage("call");
    const my = ++run.current;
    const rec = await loadCall(`verify-${lang}`);
    for (let i = 0; i < script.length; i++) {
      if (run.current !== my) return;
      setLine(i);
      if (rec && rec.turns.length === script.length) await playTurn(rec, i);
      else await speak(script[i], lang, "caller");
    }
  };
  const reply = (answer) => {
    if (sent) return;
    setSent(true); run.current++; stopSpeaking();
    onAnswer(answer);
  };
  const mm = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  if (stage === "ring") return (
    <div className="app-screen cg-dark cg-ring vf">
      <div className="cg-ring-top">
        <small>{V.incoming}</small>
        <h2>{V.caller}</h2>
        <span className="vf-official"><Icon name="shield" size={15} stroke={2.2} />{V.official}</span>
      </div>
      <span className="cg-big-ava vf-ava"><Icon name="bank" size={42} stroke={1.8} /></span>
      <div className="cg-actions">
        <span><button className="cg-round red" onClick={() => reply("no_answer")} aria-label={V.decline}><Icon name="close" size={30} stroke={2.4} /></button><small>{V.decline}</small></span>
        <span><button className="cg-round green" onClick={accept} aria-label={V.accept}><Icon name="phone" size={30} stroke={2.2} /></button><small>{V.accept}</small></span>
      </div>
    </div>
  );

  return (
    <div className="app-screen cg-dark cg-call vf">
      <header className="cg-call-head">
        <b>{V.caller}</b>
        <small>{V.official} · {mm}</small>
      </header>
      <section className="vf-tx">
        <small>{V.txLabel}</small>
        <b>{fmt(amount)} ₸</b>
        <span>{recipient}</span>
        <ul>{check.verify.reasons.map((r, i) => <li key={i}>{r[lang]}</li>)}</ul>
      </section>
      <section className="vf-captions" aria-live="polite">
        {script.map((s, i) => <p key={i} className={i === line ? "now" : i < line ? "done" : ""}>{s}</p>)}
      </section>
      <div className="vf-keys">
        <button className="vf-key yes" disabled={sent} onClick={() => reply("self")}><b>1</b><span>{V.yes}</span></button>
        <button className="vf-key no" disabled={sent} onClick={() => reply("not_me")}><b>2</b><span>{V.no}</span></button>
      </div>
    </div>
  );
}
