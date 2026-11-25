// Everyday banking in the browser: the same as backend/bank.py (products, operations, payments, QR purchases).
import SEED from "../../../shared/bank_seed.json";

export { SEED };
let PAYMENTS = {};   // persona id -> operations made in this demo session
export const reset = () => { PAYMENTS = {}; };

const pad = (n) => String(n).padStart(2, "0");
// an Almaty wall-clock time as "YYYY-MM-DDTHH:MM:SS+05:00", like Python's isoformat
function iso(local) {
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}+05:00`;
}
const almaty = (now) => new Date(now.getTime() + 5 * 3600_000);

function seedOps(pid, now) {
  return (SEED.clients[pid]?.operations || []).map((o, i) => {
    const [hh, mm] = o.time.split(":").map(Number);
    const d = almaty(now); d.setUTCDate(d.getUTCDate() - o.days_ago); d.setUTCHours(hh, mm, 0, 0);
    return { id: `seed-${pid}-${i}`, time: iso(d), category: o.category, title: o.title, amount: o.amount, status: "done" };
  });
}

export function state(persona, locked, txs, names, now) {
  const pid = persona.id, c = SEED.clients[pid] || {}, mine = PAYMENTS[pid] || [];
  const sent = txs.filter((t) => t.status === "approved").reduce((a, t) => a + t.amount, 0);
  const paid = mine.reduce((a, o) => a - o.amount, 0);
  const balance = persona.balance - sent - paid;
  const tops = txs.map((t) => ({ id: t.id, time: t.time, category: "transfer_out", title: names[t.recipient] || t.recipient,
    amount: -t.amount, status: t.status, tx: true }));
  const ops = [...seedOps(pid, now), ...mine, ...tops].sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  const ago = almaty(now); ago.setUTCDate(ago.getUTCDate() - 30);
  const monthAgo = iso(ago), spend = {};
  for (const o of ops) if (o.amount < 0 && o.time >= monthAgo && ["done", "approved"].includes(o.status)) spend[o.category] = (spend[o.category] || 0) - o.amount;
  return { persona: pid, card: c.card || null, balance, available: balance - locked, locked,
    cashback: (c.cashback || 0) + mine.reduce((a, o) => a + (o.cashback || 0), 0),
    deposits: c.deposits || [], accounts: c.accounts || [], spend, operations: ops };
}

export const catalogue = () => ({ categories: SEED.categories, payments: SEED.payments, shops: SEED.shops, cashback_rates: SEED.cashback_rates });

export function pay(pid, available, b, now) {
  const amount = Math.round(Number(b.amount) || 0);
  if (amount <= 0) throw new Error("amount must be positive");
  if (amount > available) throw new Error("not enough money");
  let op;
  if (b.kind === "payment") {
    const group = SEED.payments.find((p) => p.category === b.category);
    if (!group || !group.providers.includes(b.provider)) throw new Error("unknown provider");
    if (String(b.account || "").trim().length < 3) throw new Error("account is required");
    op = { category: b.category, title: b.provider, account: String(b.account).trim().slice(-4) };
  } else if (b.kind === "purchase") {
    const s = SEED.shops.find((x) => x.id === b.shop);
    if (!s) throw new Error("unknown shop");
    op = { category: s.category, title: s.name };
  } else throw new Error("unknown kind");
  const rate = SEED.cashback_rates[op.category] || 0;
  Object.assign(op, { id: "op-" + Math.random().toString(16).slice(2, 10), time: iso(almaty(now)), amount: -amount,
    status: "done", kind: b.kind, cashback: Math.round(amount * rate) });
  (PAYMENTS[pid] ??= []).push(op);
  return op;
}
