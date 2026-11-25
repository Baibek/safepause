// Everyday banking on the demo phone: home, payments, QR purchases and the operations history.
// Original design; every name, product and number is synthetic (shared/bank_seed.json).
import React, { useEffect, useMemo, useState } from "react";
import { api, fmt } from "../i18n.js";
import { Icon } from "./PhoneFrame.jsx";

export const BK = {
  kk: {
    protectChip: (i) => `Senim қорғанысы · ${i}`,
    stories: [
      { text: "5% кешбэк: супермаркет", tone: "green", icon: "cart", go: "payments" },
      { text: "«Қауіпсіз шот» — алаяқтық", tone: "red", icon: "alert", go: "bankcall" },
      { text: "Ақшаны сейфке салу", tone: "navy", icon: "lock", go: "protect" },
      { text: "Күдікті SMS тексеру", tone: "violet", icon: "message", go: "messages" },
    ],
    analytics: "Менің аналитикам", analyticsSub: "30 күндегі шығыс", cashback: "Кешбэк", cashbackSub: "осы айда жиналды",
    chips: { qr: "QR", transfer: "Аудару", payments: "Төлемдер", messages: "Тексеріп бер", call: "Қоңырау" },
    myBank: "Менің банкім", hide: "Балансты жасыру", show: "Балансты көрсету",
    cards: "Карталар", deposits: "Депозиттер", accounts: "Шоттар", inSafe: "Сейфте", available: "Қолжетімді",
    rate: (r) => `жылдық ${String(r).replace(".", ",")}%`, openProduct: "Карта, депозит не шот ашу",
    recent: "Соңғы операциялар", all: "Барлығы",
    payTitle: "Төлемдер", qrTitle: "QR арқылы төлеу", qrSub: "Дүкенде, кафеде, дәріханада", services: "Қызметтер",
    choose: "Провайдерді таңдаңыз", amount: "Сома", payBtn: (a) => `Төлеу ${a} ₸`, from: "Картадан",
    done: "Төлем өтті", doneSub: "Чек «Тарих» бөлімінде", cashbackEarned: (a) => `Кешбэк: +${a} ₸`, toHome: "Басты бетке", again: "Тағы төлеу",
    scan: "QR-кодты рамкаға әкеліңіз", near: "Демо: камера орнына дүкенді таңдаңыз", buy: "Сатып алу", shop: "Дүкен",
    histTitle: "Тарих", filters: { all: "Барлығы", out: "Шығыс", in: "Кіріс" }, today: "Бүгін", yesterday: "Кеше",
    noFunds: "Картада қаражат жеткіліксіз", failed: "Төлем өтпеді", accountShort: "Кемінде 3 таңба енгізіңіз",
    safeNote: "Төлемдер мен сатып алу белгілі провайдерлер мен дүкендерге кетеді. Адамға аударымды Senim әрқашан тексереді.",
    months: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"],
    back: "Артқа", emptyOps: "Операция жоқ",
  },
  ru: {
    protectChip: (i) => `Защита Senim · ${i}`,
    stories: [
      { text: "5% кешбэк: супермаркеты", tone: "green", icon: "cart", go: "payments" },
      { text: "«Безопасный счёт» — обман", tone: "red", icon: "alert", go: "bankcall" },
      { text: "Деньги в сейф", tone: "navy", icon: "lock", go: "protect" },
      { text: "Проверить SMS", tone: "violet", icon: "message", go: "messages" },
    ],
    analytics: "Моя аналитика", analyticsSub: "расходы за 30 дней", cashback: "Кешбэк", cashbackSub: "накоплено в этом месяце",
    chips: { qr: "QR", transfer: "Перевести", payments: "Платежи", messages: "Проверить", call: "Звонок" },
    myBank: "Мой банк", hide: "Скрыть баланс", show: "Показать баланс",
    cards: "Карты", deposits: "Депозиты", accounts: "Счета", inSafe: "В сейфе", available: "Доступно",
    rate: (r) => `${String(r).replace(".", ",")}% годовых`, openProduct: "Открыть карту, депозит или счёт",
    recent: "Последние операции", all: "Все",
    payTitle: "Платежи", qrTitle: "Оплатить по QR", qrSub: "В магазине, кафе, аптеке", services: "Услуги",
    choose: "Выберите поставщика", amount: "Сумма", payBtn: (a) => `Оплатить ${a} ₸`, from: "С карты",
    done: "Платёж прошёл", doneSub: "Чек сохранён в «Истории»", cashbackEarned: (a) => `Кешбэк: +${a} ₸`, toHome: "На главную", again: "Оплатить ещё",
    scan: "Наведите рамку на QR-код", near: "Демо: выберите магазин вместо камеры", buy: "Покупка", shop: "Магазин",
    histTitle: "История", filters: { all: "Все", out: "Расходы", in: "Поступления" }, today: "Сегодня", yesterday: "Вчера",
    noFunds: "На карте недостаточно средств", failed: "Платёж не прошёл", accountShort: "Введите хотя бы 3 символа",
    safeNote: "Платежи и покупки уходят известным поставщикам и магазинам. Переводы людям Senim проверяет всегда.",
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    back: "Назад", emptyOps: "Операций нет",
  },
};

const titleOf = (t, lang) => (typeof t === "string" ? t : t?.[lang] || "");
const hhmm = (iso) => iso.slice(11, 16);
const money = (n, hidden) => (hidden ? "••• ₸" : `${fmt(n)} ₸`);

export function CatIcon({ cat, category, size = 40 }) {
  const c = cat?.categories?.[category] || { icon: "card", tone: "blue" };
  return <span className={"bk-cat t-" + c.tone} style={{ width: size, height: size }}><Icon name={c.icon} size={Math.round(size * 0.5)} stroke={1.9} /></span>;
}

export function OpRow({ op, cat, lang, P, B }) {
  const c = cat?.categories?.[op.category];
  const pending = op.tx && op.status !== "approved";
  const sub = op.tx && op.status !== "approved" ? P.status[op.status] || op.status : c?.[lang] || "";
  return (
    <li className="bk-op">
      <CatIcon cat={cat} category={op.category} />
      <span className="bk-op-main"><b>{titleOf(op.title, lang)}</b><small>{sub} · {hhmm(op.time)}</small></span>
      <span className="bk-op-side">
        <b className={(op.amount > 0 ? "in" : "") + (pending ? " muted" : "")}>{op.amount > 0 ? "+" : "−"}{fmt(Math.abs(op.amount))} ₸</b>
        {op.cashback > 0 && <small>{B.cashbackEarned(fmt(op.cashback))}</small>}
      </span>
    </li>
  );
}

function SpendBar({ spend, cat }) {
  const total = Object.values(spend).reduce((a, b) => a + b, 0) || 1;
  const parts = Object.entries(spend).sort((a, b) => b[1] - a[1]);
  return (
    <span className="bk-spend" aria-hidden="true">
      {parts.map(([k, v]) => <i key={k} className={"t-" + (cat?.categories?.[k]?.tone || "blue")} style={{ flexGrow: v / total }} />)}
    </span>
  );
}

/** The bank's home screen: stories, analytics and cashback, quick actions, "My bank" and recent operations. */
export function BankHome({ persona, bank, cat, P, t, lang, scamCallMinutes, onDismissCall, go, prot }) {
  const B = BK[lang];
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState({ cards: true, deposits: false, accounts: false });
  const first = persona.name.split(" ")[0];
  const spendTotal = bank ? Object.values(bank.spend).reduce((a, b) => a + b, 0) : 0;
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  return (
    <div className="app-screen bk-home">
      <header className="bk-head">
        <span className="avatar">{persona.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
        <div><b>{first}</b><button className="bk-chip" onClick={() => go("protect")}><Icon name="shield" size={12} stroke={2.4} />{B.protectChip(prot?.index ?? 0)}</button></div>
        <button className="bk-round" onClick={() => go("messages")} aria-label={B.chips.messages}><Icon name="message" size={20} /></button>
      </header>

      <div className="bk-stories" role="list">
        {B.stories.map((s) => (
          <button key={s.text} role="listitem" className={"bk-story t-" + s.tone} onClick={() => go(s.go)}>
            <span className="bk-story-ic"><Icon name={s.icon} size={18} stroke={2} /></span><span>{s.text}</span>
          </button>
        ))}
      </div>

      {scamCallMinutes != null && (
        <section className="sec-card alert" role="status">
          <span className="sec-ic"><Icon name="alert" /></span>
          <div><b>{t.callAlert(Math.round(scamCallMinutes))}</b><small>{t.callAlertSub}</small>
            <button className="link-btn" onClick={onDismissCall}>{t.callAlertOk}</button></div>
        </section>
      )}

      <div className="bk-duo">
        <button className="bk-tile" onClick={() => go("history")}>
          <b>{B.analytics}</b><small>{B.analyticsSub}</small>
          <span className="bk-big">{money(spendTotal, hidden)}</span>
          {bank && <SpendBar spend={bank.spend} cat={cat} />}
        </button>
        <button className="bk-tile" onClick={() => go("payments")}>
          <b>{B.cashback}</b><small>{B.cashbackSub}</small>
          <span className="bk-big green">{money(bank?.cashback || 0, hidden)}</span>
          <span className="bk-mini-cats">{["grocery", "pharmacy", "cafe"].map((k) => <CatIcon key={k} cat={cat} category={k} size={22} />)}</span>
        </button>
      </div>

      <div className="bk-chips">
        {[["qr", "qr"], ["send", "transfer"], ["wallet", "payments"], ["message", "messages"], ["phone", "call"]].map(([icon, to]) => (
          <button key={to} onClick={() => go(to === "qr" ? "qr" : to)}><Icon name={icon} size={18} />{B.chips[to]}</button>
        ))}
      </div>

      <section className="bk-card">
        <div className="bk-sec-head"><h3>{B.myBank}</h3><button className="link-btn" onClick={() => setHidden((h) => !h)}>{hidden ? B.show : B.hide}</button></div>
        <button className="bk-acc" aria-expanded={open.cards} onClick={() => toggle("cards")}><span>{B.cards}</span><Icon name="down" size={18} /></button>
        {open.cards && bank?.card && (
          <div className="bk-acc-body">
            <div className="bk-prod">
              <span className="bk-mini-card"><i>{bank.card.last4}</i></span>
              <span className="bk-prod-main"><b>{money(bank.available, hidden)}</b><small>{bank.card.name} · •• {bank.card.last4} · {bank.card.system}</small></span>
            </div>
            {bank.locked > 0 && (
              <button className="bk-prod" onClick={() => go("protect")}>
                <span className="bk-mini-ic"><Icon name="lock" size={18} /></span>
                <span className="bk-prod-main"><b>{money(bank.locked, hidden)}</b><small>{B.inSafe}</small></span>
              </button>
            )}
          </div>
        )}
        <button className="bk-acc" aria-expanded={open.deposits} onClick={() => toggle("deposits")}><span>{B.deposits}</span><Icon name="down" size={18} /></button>
        {open.deposits && bank && (
          <div className="bk-acc-body">
            {bank.deposits.map((d) => (
              <div key={titleOf(d.name, lang)} className="bk-prod">
                <span className="bk-mini-ic"><Icon name="chart" size={18} /></span>
                <span className="bk-prod-main"><b>{money(d.amount, hidden)}</b><small>{titleOf(d.name, lang)} · {B.rate(d.rate)}</small></span>
              </div>
            ))}
          </div>
        )}
        <button className="bk-acc" aria-expanded={open.accounts} onClick={() => toggle("accounts")}><span>{B.accounts}</span><Icon name="down" size={18} /></button>
        {open.accounts && bank && (
          <div className="bk-acc-body">
            {bank.accounts.map((a) => (
              <div key={titleOf(a.name, lang)} className="bk-prod">
                <span className="bk-mini-ic"><Icon name="wallet" size={18} /></span>
                <span className="bk-prod-main"><b>{hidden ? "•••" : `${fmt(a.amount)} ${a.currency}`}</b><small>{titleOf(a.name, lang)}</small></span>
              </div>
            ))}
          </div>
        )}
        <button className="bk-open" onClick={() => go("protect")}><Icon name="plus" size={16} stroke={2.2} />{B.openProduct}</button>
      </section>

      <div className="list-head"><h3>{B.recent}</h3><button className="link-btn" onClick={() => go("history")}>{B.all}</button></div>
      {bank?.operations?.length ? (
        <ul className="bk-ops">{bank.operations.slice(0, 5).map((op) => <OpRow key={op.id} op={op} cat={cat} lang={lang} P={P} B={B} />)}</ul>
      ) : <p className="empty">{P.loading}</p>}
    </div>
  );
}

/** Payments: QR purchase, service categories, provider, form, receipt. */
export function PaymentsScreen({ persona, bank, cat, lang, P, onPaid, initial = "main", goHome }) {
  const B = BK[lang];
  const [view, setView] = useState(initial);   // main | providers | form | qr | shop | done
  const [group, setGroup] = useState(null);
  const [provider, setProvider] = useState("");
  const [shop, setShop] = useState(null);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => { setView(initial); }, [initial]);
  const label = (k) => cat?.categories?.[k]?.[lang] || k;

  const pay = async (body) => {
    setBusy(true); setErr("");
    try {
      const r = await api("/api/bank/pay", { persona: persona.id, amount: Number(amount), ...body });
      onPaid(r.bank); setDone(r.operation); setView("done");
    } catch (e) {
      setErr(/not enough/.test(e.message) ? B.noFunds : /account/.test(e.message) ? B.accountShort : `${B.failed}: ${e.message}`);
    } finally { setBusy(false); }
  };
  const back = (to) => <header className="nav-bar"><button className="nav-back" onClick={() => { setErr(""); setView(to); }} aria-label={B.back}><Icon name="back" size={22} stroke={2.2} /></button><b /><span /></header>;
  const amountField = (
    <>
      <label className="bk-label">{B.amount}</label>
      <div className="bk-amount"><input inputMode="numeric" value={amount ? fmt(Number(amount)) : ""} placeholder="0"
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} aria-label={B.amount} /><span>₸</span></div>
      <p className="bk-from">{B.from}: {bank?.card?.name} •• {bank?.card?.last4} · {fmt(bank?.available || 0)} ₸</p>
    </>
  );

  if (view === "done" && done) {
    return (
      <div className="app-screen bk-done">
        <span className="bk-tick"><Icon name="check" size={36} stroke={2.6} /></span>
        <h1 className="large-title">{B.done}</h1>
        <p className="bk-receipt-amt">−{fmt(-done.amount)} ₸</p>
        <ul className="bk-receipt">
          <li><span>{done.kind === "purchase" ? B.shop : label(done.category)}</span><b>{done.title}</b></li>
          {done.account && <li><span>№</span><b>•••• {done.account}</b></li>}
          <li><span>{B.from}</span><b>•• {bank?.card?.last4}</b></li>
          <li><span>{hhmm(done.time)}</span><b>{B.doneSub}</b></li>
          {done.cashback > 0 && <li className="cb"><span>{B.cashback}</span><b>+{fmt(done.cashback)} ₸</b></li>}
        </ul>
        <button className="btn primary-blue" onClick={goHome}>{B.toHome}</button>
        <button className="link-btn center" onClick={() => { setAmount(""); setAccount(""); setView("main"); }}>{B.again}</button>
      </div>
    );
  }
  if (view === "qr") {
    return (
      <div className="app-screen bk-qr">
        {back("main")}
        <h1 className="large-title">{B.qrTitle}</h1>
        <div className="bk-finder" aria-hidden="true"><i /><Icon name="qr" size={64} stroke={1.2} /></div>
        <p className="bk-hint">{B.scan}</p>
        <p className="bk-label">{B.near}</p>
        <ul className="bk-list">
          {(cat?.shops || []).map((s) => (
            <li key={s.id}><button onClick={() => { setShop(s); setAmount(String(s.amount)); setView("shop"); }}>
              <CatIcon cat={cat} category={s.category} /><span><b>{s.name}</b><small>{label(s.category)}</small></span><Icon name="chevron" size={18} />
            </button></li>
          ))}
        </ul>
      </div>
    );
  }
  if (view === "shop" && shop) {
    const rate = cat?.cashback_rates?.[shop.category] || 0;
    return (
      <div className="app-screen bk-form">
        {back("qr")}
        <div className="bk-merchant"><CatIcon cat={cat} category={shop.category} size={56} /><b>{shop.name}</b><small>{B.buy} · QR</small></div>
        {amountField}
        {rate > 0 && Number(amount) > 0 && <p className="bk-cb-note">{B.cashbackEarned(fmt(Math.round(Number(amount) * rate)))}</p>}
        {err && <p className="bk-err" role="alert">{err}</p>}
        <button className="btn primary-blue" disabled={busy || !Number(amount)} onClick={() => pay({ kind: "purchase", shop: shop.id })}>{B.payBtn(fmt(Number(amount) || 0))}</button>
      </div>
    );
  }
  if (view === "providers" && group) {
    return (
      <div className="app-screen">
        {back("main")}
        <h1 className="large-title">{label(group.category)}</h1>
        <p className="bk-label">{B.choose}</p>
        <ul className="bk-list">
          {group.providers.map((p) => (
            <li key={p}><button onClick={() => { setProvider(p); setAccount(""); setAmount(""); setView("form"); }}>
              <CatIcon cat={cat} category={group.category} /><span><b>{p}</b></span><Icon name="chevron" size={18} />
            </button></li>
          ))}
        </ul>
      </div>
    );
  }
  if (view === "form" && group) {
    return (
      <div className="app-screen bk-form">
        {back("providers")}
        <div className="bk-merchant"><CatIcon cat={cat} category={group.category} size={56} /><b>{provider}</b><small>{label(group.category)}</small></div>
        <label className="bk-label" htmlFor="bk-acc">{group.account[lang]}</label>
        <input id="bk-acc" className="bk-input" value={account} onChange={(e) => setAccount(e.target.value.slice(0, 20))} inputMode="numeric" />
        {amountField}
        <div className="bk-quick">{[2000, 5000, 10000].map((v) => <button key={v} onClick={() => setAmount(String(v))}>{fmt(v)}</button>)}</div>
        {err && <p className="bk-err" role="alert">{err}</p>}
        <button className="btn primary-blue" disabled={busy || !Number(amount) || !account.trim()} onClick={() => pay({ kind: "payment", category: group.category, provider, account })}>{B.payBtn(fmt(Number(amount) || 0))}</button>
      </div>
    );
  }
  return (
    <div className="app-screen">
      <h1 className="large-title">{B.payTitle}</h1>
      <button className="bk-qr-card" onClick={() => setView("qr")}>
        <span className="bk-qr-ic"><Icon name="qr" size={28} stroke={1.8} /></span>
        <span><b>{B.qrTitle}</b><small>{B.qrSub}</small></span><Icon name="chevron" size={20} />
      </button>
      <h3 className="bk-h3">{B.services}</h3>
      <div className="bk-grid">
        {(cat?.payments || []).map((g) => (
          <button key={g.category} onClick={() => { setGroup(g); setView("providers"); }}>
            <CatIcon cat={cat} category={g.category} size={48} /><span>{label(g.category)}</span>
          </button>
        ))}
      </div>
      <p className="bk-note"><Icon name="shield" size={16} stroke={2} />{B.safeNote}</p>
    </div>
  );
}

/** All operations grouped by day, with an expense / income filter. */
export function OpsScreen({ bank, cat, lang, P, onBack }) {
  const B = BK[lang];
  const [f, setF] = useState("all");
  const groups = useMemo(() => {
    const ops = (bank?.operations || []).filter((o) => f === "all" || (f === "in" ? o.amount > 0 : o.amount < 0));
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const y = new Date(Date.now() + 5 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    const out = [];
    for (const o of ops) {
      const d = o.time.slice(0, 10);
      const name = d === today ? B.today : d === y ? B.yesterday : `${Number(d.slice(8, 10))} ${B.months[Number(d.slice(5, 7)) - 1]}`;
      if (!out.length || out[out.length - 1].d !== d) out.push({ d, name, ops: [] });
      out[out.length - 1].ops.push(o);
    }
    return out;
  }, [bank, f, lang]);
  return (
    <div className="app-screen">
      {onBack && <header className="nav-bar"><button className="nav-back" onClick={onBack} aria-label={B.back}><Icon name="back" size={22} stroke={2.2} /></button><b /><span /></header>}
      <h1 className="large-title">{B.histTitle}</h1>
      <div className="bk-seg">{Object.keys(B.filters).map((k) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{B.filters[k]}</button>)}</div>
      {groups.length ? groups.map((g) => (
        <section key={g.d}>
          <h3 className="bk-day">{g.name}</h3>
          <ul className="bk-ops">{g.ops.map((op) => <OpRow key={op.id} op={op} cat={cat} lang={lang} P={P} B={B} />)}</ul>
        </section>
      )) : <p className="empty">{bank ? B.emptyOps : P.loading}</p>}
    </div>
  );
}
