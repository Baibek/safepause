import React from "react";
import { fmt } from "../i18n.js";
import { amountInWords } from "./words.js";

// Display details per demo recipient (the bank API knows only the account).
const CONTACT = {
  family: { phone: "+7 701 ••• 41 22", card: "4400 •••• •••• 7730", initials: "МС" },
  utility: { phone: "—", card: "—", initials: "КТ" },
  new_clean: { phone: "+7 747 ••• 08 15", card: "5169 •••• •••• 2208", initials: "ЕҚ" },
  new_drop: { phone: "+7 705 ••• 93 40", card: "4405 •••• •••• 4471", initials: "?" },
};

export const TRANSFER_TYPES = ["phone", "card", "iban"];

const Icon = ({ type }) => {
  const paths = {
    phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
    card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></>,
    iban: <><path d="M4 9.5 12 4l8 5.5" /><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20h17" /></>,
    back: <path d="M15 5 8 12l7 7" />,
  };
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
};

/**
 * The "Transfers" section of the banking app: choose a transfer type, then fill one form.
 * Sending goes through SafePause (onSend) exactly like the old single form.
 */
export default function TransferSection({ step, setStep, boot, lang, t, persona, balance, sc, set, onSend, err, alert }) {
  const known = boot.recipients.filter((r) => r.id !== "utility");
  const rec = boot.recipients.find((r) => r.id === sc.recipient) || boot.recipients[0];
  const type = sc.ttype || "phone";
  const amount = Number(sc.amount) || 0;
  const field = type === "iban" ? rec.account : CONTACT[rec.id]?.[type] || rec.account;
  const words = amount ? amountInWords(amount, lang) : "";

  if (step !== "form") return (
    <div className="screen tr">
      <div className="tr-head"><span className="hello">{persona.name}</span><h4 className="first">{t.trTitle}</h4></div>
      {alert}
      <div className="card-balance">
        <span>{t.trFrom} · {t.trCardMask}</span>
        <b>{fmt(balance)} ₸</b>
      </div>
      <ul className="tr-types">
        {TRANSFER_TYPES.map((ty) => (
          <li key={ty}>
            <button onClick={() => { set({ ttype: ty, recipient: ty === "iban" ? "utility" : sc.recipient === "utility" ? "family" : sc.recipient }); setStep("form"); }}>
              <Icon type={ty} />
              <span><b>{t.trType[ty]}</b><small>{t.trTypeSub[ty]}</small></span>
            </button>
          </li>
        ))}
      </ul>
      <span className="lbl">{t.trRecent}</span>
      <div className="tr-recents">
        {known.map((r) => (
          <button key={r.id} onClick={() => { set({ ttype: "phone", recipient: r.id }); setStep("form"); }}>
            <i className={r.known ? "" : "new"}>{CONTACT[r.id]?.initials}</i>
            <small>{r.name[lang].split(/[—(]/)[r.known ? 0 : 1]?.trim() || r.name[lang]}</small>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="screen tr">
      <div className="tr-bar">
        <button className="tr-back" onClick={() => setStep("menu")} aria-label={t.trBack}><Icon type="back" /></button>
        <b>{t.trType[type]}</b>
      </div>
      {alert}
      <div className="tr-row">
        <span className="lbl">{t.trFrom}</span>
        <div className="tr-source"><Icon type="card" /><span>{t.trCardMask}</span><b>{fmt(balance)} ₸</b></div>
      </div>

      <div className="tr-row">
        <span className="lbl">{t.trTo}</span>
        {type !== "iban" && (
          <div className="tr-chips">
            {known.map((r) => (
              <button key={r.id} className={r.id === rec.id ? "on" : ""} onClick={() => set({ recipient: r.id })}>
                <i className={r.known ? "" : "new"}>{CONTACT[r.id]?.initials}</i>{r.name[lang].replace(/\s*\(.*\)/, "").replace(/^.*—\s*/, "")}
              </button>
            ))}
          </div>
        )}
        <div className="tr-field">{field}</div>
        <p className={"tr-lookup " + (rec.known ? "ok" : "new")}>
          {rec.known ? `✓ ${rec.name[lang]}` : t.trNewRecipient}
        </p>
      </div>

      <div className="tr-row">
        <label className="lbl" htmlFor="amt">{t.trAmount}</label>
        <div className="tr-amount">
          <input id="amt" inputMode="numeric" autoComplete="off" value={amount ? fmt(amount) : ""} placeholder="0"
            onChange={(e) => set({ amount: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
          <span>₸</span>
        </div>
        <p className="tr-words" aria-live="polite">{words || t.trWordsHint}</p>
        <div className="tr-quick">
          {[5000, 10000, 50000].map((v) => <button key={v} onClick={() => set({ amount: String(amount + v) })}>+{fmt(v)}</button>)}
        </div>
      </div>

      <div className="tr-fee"><span>{t.trFee}</span><b>0 ₸</b></div>
      <label className="lbl" htmlFor="tr-msg">{t.trMessage}</label>
      <input id="tr-msg" className="tr-msg" value={sc.note || ""} maxLength={60} onChange={(e) => set({ note: e.target.value })} placeholder={t.trMessageHint} />
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={!amount} onClick={onSend}>{amount ? t.trSend(fmt(amount)) : t.send}</button>
    </div>
  );
}
