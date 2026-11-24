// Senim Saqshy state in the browser: the same as backend/saqshy.py (money lock, trusted contact, Call Status
// sessions, dropper list, name check, security index, audit log), seeded from shared/seed_saqshy.json.
import SEED from "../../../shared/seed_saqshy.json";

export { SEED };
export const INDEX_POINTS = { passkey: 35, trusted: 35, locked: 30 };
export let CLIENTS = {}, SESSIONS = {}, DROP_LIST = {}, AUDIT = [];
export const CLOCK = { offset_hours: 0 };

export function reset() {
  CLIENTS = JSON.parse(JSON.stringify(SEED.clients)); SESSIONS = {}; DROP_LIST = {}; AUDIT = [];
  CLOCK.offset_hours = 0;
}

export const now = () => new Date(Date.now() + CLOCK.offset_hours * 3600_000);
export function nowIso() {
  const d = new Date(now().getTime() + 5 * 3600_000);
  return d.toISOString().slice(0, 19) + "+05:00";
}

export function maskPhone(p) {
  const digits = String(p || "").replace(/\D/g, "");
  return digits.length >= 2 ? `+7 ••• ••• ${digits.slice(-2)}` : "•••";
}

export function audit(actor, role, action, target, reason = "") {
  AUDIT.unshift({ time: nowIso(), actor, role, action, target,
    reason: String(reason).replace(/\+?\d[\d\s()-]{8,}\d/g, (m) => maskPhone(m)) });
}

export const client = (pid) => (CLIENTS[pid] ??= { locked: 0, passkey: false, trusted: null });

export function securityIndex(c) {
  const trusted = Boolean(c.trusted) && (c.trusted === true || c.trusted.state === "active");
  return INDEX_POINTS.passkey * Boolean(c.passkey) + INDEX_POINTS.trusted * trusted + INDEX_POINTS.locked * Boolean(c.locked);
}

export function trustedActive(pid) {
  const t = client(pid).trusted;
  return t && t.state === "active" ? t : null;
}

export const available = (pid, balance) => balance - client(pid).locked;

export function adoption() {
  const rows = [
    ...Object.keys(CLIENTS).map((pid) => ({ trusted: Boolean(trustedActive(pid)), locked: Boolean(CLIENTS[pid].locked), passkey: CLIENTS[pid].passkey })),
    ...SEED.background.map((b) => ({ trusted: b.trusted, locked: Boolean(b.locked), passkey: b.passkey })),
  ];
  const share = (k) => Math.round((rows.filter((r) => r[k]).length / rows.length) * 1000) / 1000;
  return { trusted: share("trusted"), locked: share("locked"), passkey: share("passkey"), clients: rows.length };
}

// incoming money: the graph flags droppers by itself (as backend/saqshy.py)
export function flag(account, fanIn, holdMin, source) {
  if (DROP_LIST[account]) return;
  DROP_LIST[account] = { account, by: "graph", auto: true, fan_in: fanIn, hold_min: holdMin, source,
    reason: `${fanIn} senders, money held ${holdMin ?? "?"} min`, time: nowIso() };
  audit("Граф", "system", "droplist_auto", account, DROP_LIST[account].reason);
}
export function flagFromGraph(nodes, rule) {
  for (const n of nodes) if (n.fan_in >= rule.senders && n.hold_min != null && n.hold_min <= rule.max_hold_min) flag(n.id, n.fan_in, n.hold_min, "graph");
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-zа-яёәғқңөұүһі ]/g, "").split(/\s+/).filter(Boolean);

export function nameCheck(recipientId, typed) {
  const owner = SEED.owners[recipientId];
  if (!owner || !String(typed || "").trim()) return null;
  const o = norm(owner), t = norm(typed);
  const so = new Set(o), st = new Set(t);
  const same = so.size === st.size && [...st].every((w) => so.has(w));
  const match = same ? "full" : t.some((w) => so.has(w)) ? "partial" : "mismatch";
  return { match, owner_masked: o.map((w) => w[0].toUpperCase() + "•".repeat(w.length - 1)).join(" ") };
}

export const staff = (id) => SEED.staff.find((s) => s.id === id) || null;

reset();
