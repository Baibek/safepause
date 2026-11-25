// The browser engine must pass the same Senim Saqshy acceptance scenarios as backend/test_scenarios.py.
// Run: npm run test:engine (bundles this file with esbuild because the engine imports JSON).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { virtualApi as api } from "./engine.js";

const ok = (p, b) => api(p, b);
const err = async (p, b) => { try { await api(p, b); return null; } catch (e) { return e; } };
const transfer = (o = {}) => ok("/api/transfer/check", { persona: "aigul", recipient_id: "new_clean", amount: 900000, lang: "kk", signals: {}, ...o });
async function answerAll(tx) {
  let r = {};
  for (let i = 0; i < 6 && !r.final; i++) {
    const t = await ok(`/api/transfer/${tx}`);
    r = await ok("/api/dialog/answer", { tx_id: tx, lang: "kk", answer: t.queue[0] === "known" ? "yes" : "no" });
  }
  return r;
}
beforeEach(() => ok("/api/demo/reset", {}));

test("1: call + new recipient + large amount -> trusted contact refuses -> not sent", async () => {
  const r = await transfer({ signals: { on_call: true, unknown_caller: true } });
  assert.ok(r.score >= 80); assert.equal(r.tier, "escalate"); assert.equal(r.action, "dialog");
  const f = (await answerAll(r.tx_id)).final;
  assert.equal(f.decision, "awaiting_trusted");
  const n = (await ok("/api/guardian/notifications")).find((x) => x.tx_id === r.tx_id);
  assert.ok(n.approval); assert.equal(n.state, "open");
  await ok("/api/guardian/respond", { id: n.id, action: "stop" });
  assert.equal((await ok(`/api/transfer/${r.tx_id}`)).status, "cancelled");
});

test("1b: silent trusted contact for 24 hours means no", async () => {
  const r = await transfer({ signals: { on_call: true, unknown_caller: true } });
  await answerAll(r.tx_id);
  await ok("/api/demo/clock", { hours: 25 });
  assert.equal((await ok(`/api/transfer/${r.tx_id}`)).status, "cancelled");
});

test("2: Call Status", async () => {
  assert.deepEqual(await ok("/api/callstatus/aigul"), { active: false, staff: null });
  await ok("/api/callstatus/start", { persona: "aigul", staff_id: "BK-2041" });
  const st = await ok("/api/callstatus/aigul");
  assert.ok(st.active); assert.equal(st.staff.id, "BK-2041");
  await ok("/api/callstatus/end", { persona: "aigul" });
  assert.equal((await ok("/api/callstatus/aigul")).active, false);
});

test("3: money in the safe cannot be transferred", async () => {
  const e = await err("/api/transfer/check", { persona: "aigul", recipient_id: "family", amount: 2100000, lang: "kk", signals: {} });
  assert.equal(e.status, 409); assert.match(e.message, /сейф/);
  assert.equal((await err("/api/protect/unlock", { persona: "aigul", amount: 400000, channel: "app" })).status, 403);
  await ok("/api/protect/unlock", { persona: "aigul", amount: 400000, channel: "atm", biometric: true });
  assert.equal((await ok("/api/protect/aigul")).locked, 0);
});

test("4: usual transfer to a known recipient passes", async () => {
  const r = await transfer({ recipient_id: "family", amount: 15000 });
  assert.equal(r.action, "approve"); assert.equal(r.tier, "pass");
});

test("5: fake prize message is a scam", async () => {
  const r = await ok("/api/message/check", { lang: "kk", text: "Kaspi-ден ұтыс! Сіз 500 000 ₸ ұттыңыз, сілтемеге кіріңіз: http://kaspi-bonus.top/prize" });
  assert.equal(r.verdict, "scam");
});

test("6: dropper list raises the next transfer", async () => {
  const before = await transfer({ persona: "daniyar", amount: 20000 });
  const boot = await ok("/api/bootstrap");
  const account = boot.recipients.find((x) => x.id === "new_clean").account;
  await ok("/api/analyst/droplist", { account, reason: "fast cash-out" });
  const after = await transfer({ persona: "daniyar", amount: 20000 });
  assert.ok(before.score < 80 && after.score >= 80); assert.equal(after.tier, "escalate");
});

test("first large transfer to a new recipient waits after confirmation", async () => {
  const r = await transfer({ persona: "daniyar", amount: 210000 });
  assert.equal(r.action, "verify");
  const f = (await ok("/api/verify/respond", { tx_id: r.tx_id, answer: "self", lang: "kk" })).final;
  assert.equal(f.decision, "delayed"); assert.equal(f.delay_minutes, 30);
});

test("trusted contact from another bank must consent", async () => {
  let s = await ok("/api/protect/trusted/invite", { persona: "daniyar", name: "Сәуле Сейітова", phone: "+7 777 123 45 67", other_bank: true });
  assert.equal(s.trusted.state, "invited"); assert.equal(s.index, 0);
  s = await ok("/api/protect/trusted/accept", { persona: "daniyar" });
  assert.equal(s.index, 35);
});

test("name check", async () => {
  const m = async (name) => (await ok("/api/recipient/check", { recipient_id: "new_clean", name })).match;
  assert.deepEqual([await m("Ержан Қасымов"), await m("Ержан"), await m("Асхат Нұров")], ["full", "partial", "mismatch"]);
});

test("pasted details and dictated typing are scored", async () => {
  const r = await transfer({ persona: "daniyar", recipient_id: "family", amount: 20000, signals: { pasted: true, typing_pause_ms: 5000 } });
  const keys = r.signals.map((x) => x.key);
  assert.ok(keys.includes("pasted_details") && keys.includes("dictated_typing"));
});

// ---- passkey: a software authenticator with WebCrypto (EC P-256), as Touch ID / Face ID would sign
import { b64u, unb64u, txChallenge } from "./webauthn.js";
const enc = new TextEncoder();
function rawToDer(raw) {
  const part = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = b.slice(i); if (v[0] & 0x80) v = new Uint8Array([0, ...v]); return [0x02, v.length, ...v]; };
  const body = [...part(raw.slice(0, 32)), ...part(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}
async function authenticator() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const id = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const cd = (type, challenge) => b64u(enc.encode(JSON.stringify({ type, challenge, origin: "http://testserver" })));
  return {
    id, spki: b64u(await crypto.subtle.exportKey("spki", kp.publicKey)), cd,
    async sign(challenge) {
      const clientData = cd("webauthn.get", challenge);
      const auth = new Uint8Array([...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("testserver"))), 0x05, 0, 0, 0, 1]);
      const signed = new Uint8Array([...auth, ...new Uint8Array(await crypto.subtle.digest("SHA-256", unb64u(clientData)))]);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, signed));
      return { credential_id: id, authenticator_data: b64u(auth), client_data_json: clientData, signature: b64u(rawToDer(raw)) };
    },
  };
}
async function enroll(a) {
  const begin = await ok("/api/passkey/register/begin", { persona: "daniyar" });
  return ok("/api/passkey/register/finish", { persona: "daniyar", credential_id: a.id, public_key: a.spki, alg: -7, client_data_json: a.cd("webauthn.create", begin.challenge) });
}
const verifyTx = async () => (await transfer({ persona: "daniyar", amount: 60000, other_bank: true })).tx_id;

test("passkey: enrolment raises the index and a signed transfer passes the verification call", async () => {
  const a = await authenticator();
  assert.equal((await enroll(a)).index, 35);
  const tx = await verifyTx();
  assert.equal((await err("/api/verify/respond", { tx_id: tx, answer: "self" })).status, 403);
  const ch = await ok("/api/passkey/challenge", { tx_id: tx });
  assert.ok(ch.required); assert.equal(ch.details.amount, 60000);
  assert.ok((await ok("/api/passkey/verify", { tx_id: tx, ...(await a.sign(ch.challenge)) })).user_verified);
  assert.equal((await ok("/api/verify/respond", { tx_id: tx, answer: "self" })).final.decision, "approved");
});

test("passkey: a signature for other details or from another device fails", async () => {
  const a = await authenticator(); await enroll(a);
  const tx = await verifyTx();
  const ch = await ok("/api/passkey/challenge", { tx_id: tx });
  const other = b64u(await txChallenge({ ...ch.details, recipient: "KZ00 •••• 0000" }));
  assert.equal((await err("/api/passkey/verify", { tx_id: tx, ...(await a.sign(other)) })).status, 403);
  const b = await authenticator();
  assert.equal((await err("/api/passkey/verify", { tx_id: tx, ...(await b.sign(ch.challenge)) })).status, 403);
});

test("passkey: same canonical challenge as the server", async () => {
  // python: hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
  const d = { tx: "TX-1", amount: 60000, recipient: "KZ31 •••• 2208", nonce: "abc" };
  const hex = [...(await txChallenge(d))].map((x) => x.toString(16).padStart(2, "0")).join("");
  assert.equal(hex, "478208f66626969150a9a3e9eef73cfb21478eb5211541a4256e37b78ed98286");
});

test("check assistant: fake brand domain, dropper account and masked requisites", async () => {
  const olx = await ok("/api/message/check", { lang: "ru", text: "Для получения денег перейдите по ссылке и введите номер карты и срок действия: https://olx-delivery.kz-pay.top/receive" });
  assert.equal(olx.verdict, "scam"); assert.ok(olx.found.links.some((l) => l.fake && l.brand === "olx"));
  assert.ok(!(await ok("/api/message/check", { lang: "ru", text: "Подробности на https://kaspi.kz/shop" })).found.links.some((l) => l.fake));
  const boot = await ok("/api/bootstrap");
  await ok("/api/analyst/droplist", { account: boot.recipients.find((x) => x.id === "new_clean").account, reason: "t" });
  const r = await ok("/api/message/check", { lang: "ru", text: "Переведите на счёт KZ31 1234 5678 9012 2208 срочно, или карта 4405 1234 5678 4471" });
  const iban = r.found.requisites.find((x) => x.kind === "iban"), card = r.found.requisites.find((x) => x.kind === "card");
  assert.ok(iban.drop && r.verdict === "scam" && !iban.value.includes("1234") && card.value.endsWith("4471") && !card.value.includes("1234"));
  assert.equal((await err("/api/message/check", { lang: "kk", image: "data:image/png;base64,iVBORw0KGgo=" })).status, 503);
});

test("antifraud center report has no personal data", async () => {
  const r = await transfer({ signals: { on_call: true, unknown_caller: true } });
  const rep = await ok("/api/analyst/report", { tx_id: r.tx_id });
  const text = JSON.stringify(rep);
  assert.ok(rep.report_id.startsWith("AFC-") && rep.risk.score >= 80 && !text.includes("Айгүл") && !text.includes("Сейітова"));
});

test("behaviour v2: leaving the app, rhythm against the client's usual, phone on the table", async () => {
  const r = await transfer({ persona: "aigul", recipient_id: "family", amount: 15000,
    signals: { app_switches: 2, typing_median_ms: 1200, phone_flat: true, corrections: 7 } });
  const keys = r.signals.map((x) => x.key);
  assert.ok(["app_switch", "typing_rhythm", "phone_flat", "corrections"].every((k) => keys.includes(k)));
  assert.equal((await ok(`/api/transfer/${r.tx_id}`)).behavior.typing_baseline_ms, 420);
});

test("graph flags droppers by itself", async () => {
  const auto = (await ok("/api/dashboard")).drop_list.filter((d) => d.auto);
  assert.ok(auto.some((d) => d.account.endsWith("4471")) && auto.every((d) => d.fan_in >= 3));
});

test("report holds an unsent transfer for business days", async () => {
  const r = await transfer({ signals: { on_call: true, unknown_caller: true } });
  const rep = await ok("/api/analyst/report", { tx_id: r.tx_id });
  assert.equal(rep.hold.business_days, 5);
  assert.equal((await ok(`/api/transfer/${r.tx_id}`)).status, "afc_hold");
});

test("bank: products and operations newest first, same as backend/test_bank.py", async () => {
  const b = await ok("/api/bank/aigul");
  assert.equal(b.card.last4, "4417");
  const times = b.operations.map((o) => o.time);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(b.available, b.balance - b.locked);
  assert.ok(b.spend.grocery > 0);
});

test("bank: utility payment and QR purchase with cashback; bad ones refused", async () => {
  const before = await ok("/api/bank/daniyar");
  const r = await ok("/api/bank/pay", { persona: "daniyar", kind: "payment", category: "utilities", provider: "Тазасу · су", account: "000123456", amount: 4200 });
  assert.equal(r.operation.account, "3456");
  assert.equal(r.bank.balance, before.balance - 4200);
  assert.equal(r.bank.operations[0].id, r.operation.id);
  const q = await ok("/api/bank/pay", { persona: "daniyar", kind: "purchase", shop: "bereke", amount: 10000 });
  assert.equal(q.operation.cashback, 500);
  assert.equal(q.bank.cashback, before.cashback + 500);
  assert.equal((await err("/api/bank/pay", { persona: "aigul", kind: "purchase", shop: "nope", amount: 100 })).status, 400);
  assert.equal((await err("/api/bank/pay", { persona: "aigul", kind: "payment", category: "mobile", provider: "Дала Мобайл", account: "", amount: 100 })).status, 400);
  const a = await ok("/api/bank/aigul");
  assert.equal((await err("/api/bank/pay", { persona: "aigul", kind: "purchase", shop: "qala", amount: a.available + 1 })).status, 400);
});

test("bank: an approved transfer shows up and lowers the balance", async () => {
  const before = (await ok("/api/bank/aigul")).balance;
  const tx = await transfer({ recipient_id: "family", amount: 15000 });
  assert.equal(tx.action, "approve");
  const b = await ok("/api/bank/aigul");
  assert.equal(b.balance, before - 15000);
  assert.equal(b.operations[0].category, "transfer_out");
  assert.ok(b.operations[0].title.kk.startsWith("Мадина"));
});
