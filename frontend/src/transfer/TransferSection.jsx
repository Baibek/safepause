import React from "react";
import { fmt } from "../i18n.js";
import { amountInWords } from "./words.js";
import { Icon } from "../phone/PhoneFrame.jsx";

// Display details per demo recipient (the bank API knows only the account).
const CONTACT = {
  family: { phone: "+7 701 ••• 41 22", card: "4400 •••• •••• 7730", initials: "МС" },
  utility: { phone: "—", card: "—", initials: "КТ" },
  new_clean: { phone: "+7 747 ••• 08 15", card: "5169 •••• •••• 2208", initials: "ЕҚ" },
  new_drop: { phone: "+7 705 ••• 93 40", card: "4405 •••• •••• 4471", initials: "?" },
};

export const TRANSFER_TYPES = ["phone", "card", "iban"];
const TYPE_ICON = { phone: "phone", card: "card", iban: "bank" };
const shortName = (r, lang) => r.name[lang].replace(/\s*\(.*\)/, "").replace(/^.*—\s*/, "");

/**
 * The transfer section of the app: choose whom and how, then one form.
 * "Continue" hands the form to Senim's check (onSend), exactly as before.
 */
export default function TransferSection({ step, setStep, boot, lang, t, P, balance, sc, set, onSend, err, alert }) {
  const known = boot.recipients.filter((r) => r.id !== "utility");
  const rec = boot.recipients.find((r) => r.id === sc.recipient) || boot.recipients[0];
  const type = sc.ttype || "phone";
  const amount = Number(sc.amount) || 0;
  const field = type === "iban" ? rec.account : CONTACT[rec.id]?.[type] || rec.account;
  const words = amount ? amountInWords(amount, lang) : "";

  if (step !== "form") return (
    <div className="app-screen tr-x">
      <h1 className="large-title">{t.trTitle}</h1>
      {alert}
      <h3 className="sec-title">{t.trRecent}</h3>
      <div className="contacts">
        {known.map((r) => (
          <button key={r.id} onClick={() => { set({ ttype: "phone", recipient: r.id }); setStep("form"); }}>
            <i className={r.known ? "" : "new"}>{CONTACT[r.id]?.initials}</i>
            <small>{shortName(r, lang)}</small>
          </button>
        ))}
      </div>
      <ul className="group">
        {TRANSFER_TYPES.map((ty) => (
          <li key={ty}>
            <button onClick={() => { set({ ttype: ty, recipient: ty === "iban" ? "utility" : sc.recipient === "utility" ? "family" : sc.recipient }); setStep("form"); }}>
              <span className="g-ic"><Icon name={TYPE_ICON[ty]} size={20} /></span>
              <span className="g-txt"><b>{t.trType[ty]}</b><small>{t.trTypeSub[ty]}</small></span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="app-screen tr-x form">
      <header className="nav-bar">
        <button className="nav-back" onClick={() => setStep("menu")} aria-label={t.trBack}><Icon name="back" size={22} stroke={2.2} /></button>
        <b>{t.trType[type]}</b>
        <span />
      </header>
      {alert}
      <div className="from-row"><Icon name="card" size={20} /><span>{P.card}</span><b>{fmt(balance)} ₸</b></div>

      <span className="field-label">{t.trTo}</span>
      {type !== "iban" && (
        <div className="chips-x">
          {known.map((r) => (
            <button key={r.id} className={r.id === rec.id ? "on" : ""} onClick={() => set({ recipient: r.id })}>
              <i className={r.known ? "" : "new"}>{CONTACT[r.id]?.initials}</i>{shortName(r, lang)}
            </button>
          ))}
        </div>
      )}
      <div className="recipient-card">
        <span className={"avatar sm" + (rec.known ? "" : " new")}>{CONTACT[rec.id]?.initials}</span>
        <div><b>{field}</b><small className={rec.known ? "ok" : "new"}>{rec.known ? `✓ ${rec.name[lang]}` : t.trNewRecipient}</small></div>
      </div>

      <label className="field-label" htmlFor="amt">{t.trAmount}</label>
      <div className="amount-x">
        <input id="amt" inputMode="numeric" autoComplete="off" value={amount ? fmt(amount) : ""} placeholder="0"
          onChange={(e) => set({ amount: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
        <span>₸</span>
      </div>
      <p className="amount-words" aria-live="polite">{words || t.trWordsHint}</p>
      <div className="chips-x">
        {[5000, 10000, 50000].map((v) => <button key={v} onClick={() => set({ amount: String(amount + v) })}>+{fmt(v)}</button>)}
      </div>

      <label className="field-label" htmlFor="tr-msg">{t.trMessage}</label>
      <input id="tr-msg" className="field-x" value={sc.note || ""} maxLength={60} onChange={(e) => set({ note: e.target.value })} placeholder={t.trMessageHint} />
      <div className="fee-row"><span>{t.trFee}</span><b>0 ₸</b></div>
      {err && <p className="error">{err}</p>}
      <div className="cta-stack sticky">
        <button className="btn primary-blue" id="tr-continue" disabled={!amount} onClick={onSend}>{amount ? t.trContinue(fmt(amount)) : t.send}</button>
      </div>
    </div>
  );
}
