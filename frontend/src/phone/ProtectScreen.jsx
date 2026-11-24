import React, { useEffect, useState } from "react";
import { api, fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";

/**
 * Senim Saqshy "Protection" section: the security index, "Is this really the bank?" (Call Status), the trusted contact
 * and the money lock (safe). Reads and changes /api/protect/*; the safe only opens at an ATM or branch (simulated in the
 * analyst console), so the client can only add money to it here.
 */
export default function ProtectScreen({ persona, P, lang, onApprovals, onChange }) {
  const R = P.protect;
  const [st, setSt] = useState(null);
  const [call, setCall] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", relation: "", other: false });
  const [lockAdd, setLockAdd] = useState("");
  const [err, setErr] = useState("");

  const load = () => api(`/api/protect/${persona.id}`).then(setSt).catch((e) => setErr(String(e.message)));
  useEffect(() => { setCall(null); load(); }, [persona.id]);
  const act = async (path, body) => {
    setErr("");
    try { const s = await api(path, body); setSt(s); onChange?.(s); } catch (e) { setErr(String(e.message)); }
  };
  const checkCall = async () => setCall(await api(`/api/callstatus/${persona.id}`));

  if (!st) return <div className="app-screen protect"><h1 className="large-title">{R.title}</h1></div>;
  const t = st.trusted;
  const parts = [["passkey", st.passkey], ["trusted", t && t.state === "active"], ["locked", st.locked > 0]];
  const C = 2 * Math.PI * 30;

  return (
    <div className="app-screen protect">
      <h1 className="large-title">{R.title}</h1>

      <section className="pr-index">
        <div className="pr-ring" aria-label={`${R.indexTitle}: ${st.index}`}>
          <svg viewBox="0 0 72 72" width="76" height="76" aria-hidden="true">
            <circle cx="36" cy="36" r="30" className="pr-track" />
            <circle cx="36" cy="36" r="30" className="pr-value" strokeDasharray={C} strokeDashoffset={C * (1 - st.index / 100)} transform="rotate(-90 36 36)" />
          </svg>
          <b>{st.index}</b>
        </div>
        <div className="pr-index-txt">
          <b>{R.indexTitle}</b>
          <ul>{parts.map(([k, on]) => (
            <li key={k} className={on ? "on" : ""}><Icon name={on ? "check" : "close"} size={14} stroke={2.6} />{R.parts[k]}
              <small>+{st.index_parts[k]}{k === "passkey" && !on ? ` · ${R.soon}` : ""}</small></li>
          ))}</ul>
        </div>
      </section>

      <section className="pr-card">
        <div className="pr-head"><span className="pr-ic"><Icon name="phone" size={20} stroke={2} /></span><b>{R.callTitle}</b></div>
        <small>{R.callSub}</small>
        <button className="btn primary-blue" onClick={checkCall}>{R.callBtn}</button>
        {call && (call.active ? (
          <div className="pr-call ok" role="status"><Icon name="check" size={20} stroke={2.6} />
            <div><b>{R.callReal(call.staff.name, call.staff.id)}</b><small>{R.callRealSub}</small></div></div>
        ) : (
          <div className="pr-call bad" role="alert"><Icon name="alert" size={20} stroke={2.4} />
            <div><b>{R.callFake}</b><small>{R.callFakeSub}</small></div></div>
        ))}
      </section>

      <section className="pr-card">
        <div className="pr-head"><span className="pr-ic"><Icon name="guardian" size={20} stroke={2} /></span><b>{R.trustedTitle}</b></div>
        <small>{R.trustedHint}</small>
        {t && t.state === "active" && (
          <div className="pr-person">
            <span className="avatar alt">{t.name[0]}</span>
            <div><b>{R.active(t.name, t.relation[lang])}</b><small>{t.phone} · {t.other_bank ? R.channelSms : R.channelApp}</small></div>
          </div>
        )}
        {t && t.state === "invited" && (
          <>
            <p className="pr-note">{R.invited(t.name)}</p>
            <button className="btn outline" onClick={() => act("/api/protect/trusted/accept", { persona: persona.id })}>{R.demoAccept}</button>
          </>
        )}
        {!t && (
          <form className="pr-form" onSubmit={(e) => {
            e.preventDefault();
            act("/api/protect/trusted/invite", { persona: persona.id, name: form.name, phone: form.phone, other_bank: form.other,
              relation_kk: form.relation || "туысы", relation_ru: form.relation || "родственник" });
          }}>
            <label>{R.name}<input className="field-x" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" /></label>
            <label>{R.phone}<input className="field-x" inputMode="tel" value={form.phone} placeholder="+7 7__ ___ __ __" onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="off" /></label>
            <label>{R.relation}<input className="field-x" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} autoComplete="off" /></label>
            <label className="pr-check"><input type="checkbox" checked={form.other} onChange={(e) => setForm({ ...form, other: e.target.checked })} />{R.otherBank}</label>
            <button className="btn primary-blue" disabled={form.name.trim().length < 2 || form.phone.replace(/\D/g, "").length < 10}>{R.invite}</button>
          </form>
        )}
        {t && (
          <div className="pr-row">
            {t.state === "active" && <button className="link-btn" onClick={onApprovals}>{R.approvals}</button>}
            <button className="link-btn danger" onClick={() => act("/api/protect/trusted/remove", { persona: persona.id })}>{R.remove}</button>
          </div>
        )}
      </section>

      <section className="pr-card">
        <div className="pr-head"><span className="pr-ic"><Icon name="card" size={20} stroke={2} /></span><b>{R.safeTitle}</b></div>
        <small>{R.safeHint}</small>
        <dl className="pr-safe">
          <div><dt>{R.safeLocked}</dt><dd>{fmt(st.locked)} ₸</dd></div>
          <div><dt>{R.safeAvailable}</dt><dd>{fmt(st.available)} ₸</dd></div>
        </dl>
        <form className="pr-lock" onSubmit={(e) => { e.preventDefault(); act("/api/protect/lock", { persona: persona.id, amount: st.locked + Number(lockAdd) }); setLockAdd(""); }}>
          <label className="sr-only" htmlFor="lock-add">{R.lockMore}</label>
          <input id="lock-add" className="field-x" inputMode="numeric" placeholder={R.lockMore} value={lockAdd ? fmt(Number(lockAdd)) : ""}
            onChange={(e) => setLockAdd(e.target.value.replace(/\D/g, "").slice(0, 9))} />
          <button className="btn primary-blue" disabled={!Number(lockAdd)}>{R.lockBtn}</button>
        </form>
      </section>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
