import React, { useEffect, useState } from "react";
import { api, fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";
import { IndexRing } from "./screens.jsx";
import { passkeySupported, registerPasskey } from "./passkey.js";

/**
 * Senim Saqshy "Protection" tab. The main view: the security index, "Is this really the bank?" as the one big
 * action, and the three protections as a list, each with its state. Each protection opens its own screen, so an
 * older client deals with one thing at a time. Reads and changes /api/protect/*, /api/passkey/*, /api/callstatus/*.
 */
export default function ProtectScreen({ persona, P, lang, onApprovals, onChange, initial = "main" }) {
  const R = P.protect;
  const [view, setView] = useState(initial);
  const [st, setSt] = useState(null);
  const [call, setCall] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", relation: "", other: false });
  const [lockAdd, setLockAdd] = useState("");
  const [err, setErr] = useState("");

  const load = () => api(`/api/protect/${persona.id}`).then((s) => { setSt(s); onChange?.(s); }).catch((e) => setErr(String(e.message)));
  useEffect(() => { setCall(null); load(); }, [persona.id]);
  useEffect(() => { setView(initial); setErr(""); }, [initial]);
  const act = async (path, body) => {
    setErr("");
    try { const s = await api(path, body); setSt(s); onChange?.(s); return true; } catch (e) { setErr(String(e.message || e)); return false; }
  };
  const checkCall = async () => { setCall(null); setCall(await api(`/api/callstatus/${persona.id}`)); };
  const open = (v) => { setErr(""); setView(v); };

  if (!st) return <div className="app-screen protect"><h1 className="large-title">{R.title}</h1></div>;
  const t = st.trusted;
  const state = { passkey: st.passkey_device ? "on" : "off", trusted: t ? (t.state === "active" ? "on" : "invited") : "off", locked: st.locked > 0 ? "on" : "off" };
  const back = <header className="nav-bar"><button className="nav-back" onClick={() => open("main")} aria-label={R.back}><Icon name="back" size={22} stroke={2.2} /></button><b /><span /></header>;
  const error = err && <p className="error" role="alert">{err}</p>;

  if (view === "call") return (
    <div className="app-screen protect sub">
      {back}
      <h1 className="large-title">{R.callTitle}</h1>
      <p className="lead">{R.callSub}</p>
      <button className="btn primary-blue big" onClick={checkCall}>{R.callBtn}</button>
      {call && (call.active ? (
        <div className="pr-verdict ok" role="status"><span><Icon name="check" size={28} stroke={2.6} /></span>
          <b>{R.callReal(call.staff.name, call.staff.id)}</b><small>{R.callRealSub}</small></div>
      ) : (
        <div className="pr-verdict bad" role="alert"><span><Icon name="alert" size={28} stroke={2.4} /></span>
          <b>{R.callFake}</b><small>{R.callFakeSub}</small></div>
      ))}
    </div>
  );

  if (view === "passkey") return (
    <div className="app-screen protect sub">
      {back}
      <h1 className="large-title">{R.passkeyTitle}</h1>
      <p className="lead">{R.passkeyHint}</p>
      {st.passkey_device ? <div className="pr-verdict ok"><span><Icon name="check" size={28} stroke={2.6} /></span><b>{R.passkeyOn}</b></div>
        : !passkeySupported() ? <p className="pr-note">{R.passkeyNo}</p>
        : <button className="btn primary-blue big" onClick={async () => {
            setErr("");
            try { const s = await registerPasskey(persona.id); setSt(s); onChange?.(s); } catch (e) { setErr(String(e.message || e)); }
          }}>{R.passkeyAdd}</button>}
      {error}
    </div>
  );

  if (view === "trusted") return (
    <div className="app-screen protect sub">
      {back}
      <h1 className="large-title">{R.trustedTitle}</h1>
      <p className="lead">{R.trustedHint}</p>
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
          <button className="btn primary-blue big" disabled={form.name.trim().length < 2 || form.phone.replace(/\D/g, "").length < 10}>{R.invite}</button>
        </form>
      )}
      {t && (
        <div className="cta-stack">
          {t.state === "active" && <button className="btn outline" onClick={onApprovals}>{R.approvals}</button>}
          <button className="btn text" onClick={() => act("/api/protect/trusted/remove", { persona: persona.id })}>{R.remove}</button>
        </div>
      )}
      {error}
    </div>
  );

  if (view === "locked") return (
    <div className="app-screen protect sub">
      {back}
      <h1 className="large-title">{R.safeTitle}</h1>
      <p className="lead">{R.safeHint}</p>
      <dl className="pr-safe">
        <div><dt>{R.safeLocked}</dt><dd>{fmt(st.locked)} ₸</dd></div>
        <div><dt>{R.safeAvailable}</dt><dd>{fmt(st.available)} ₸</dd></div>
      </dl>
      <form className="pr-lock" onSubmit={async (e) => {
        e.preventDefault();
        if (await act("/api/protect/lock", { persona: persona.id, amount: st.locked + Number(lockAdd) })) setLockAdd("");
      }}>
        <label className="field-label" htmlFor="lock-add">{R.lockMore}</label>
        <input id="lock-add" className="field-x amount-in" inputMode="numeric" placeholder="0" value={lockAdd ? fmt(Number(lockAdd)) : ""}
          onChange={(e) => setLockAdd(e.target.value.replace(/\D/g, "").slice(0, 9))} />
        <button className="btn primary-blue big" disabled={!Number(lockAdd)}>{R.lockBtn}</button>
      </form>
      {error}
    </div>
  );

  return (
    <div className="app-screen protect">
      <h1 className="large-title">{R.title}</h1>
      <section className="pr-hero">
        <IndexRing value={st.index} size={92} stroke={9} />
        <div><b>{R.indexTitle}</b><small>{R.indexLead(st.index)}</small></div>
      </section>

      <button className="pr-callbtn" onClick={() => open("call")}>
        <span className="pr-callic"><Icon name="phone" size={24} stroke={2.2} /></span>
        <span><b>{R.callBig}</b><small>{R.callBigSub}</small></span>
        <Icon name="chevron" size={20} />
      </button>

      <ul className="group pr-list">
        {[["passkey", "shield"], ["trusted", "guardian"], ["locked", "card"]].map(([k, icon]) => (
          <li key={k}>
            <button onClick={() => open(k)}>
              <span className="g-ic"><Icon name={icon} size={20} /></span>
              <span className="g-txt"><b>{R.parts[k]}</b><small>{R.sub[k]}</small></span>
              <span className={"pr-chip " + state[k]}>{state[k] === "on" ? R.on : state[k] === "invited" ? R.invitedChip : R.off}</span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {error}
    </div>
  );
}
