// Run: node --test src/call/   — the browser detector must behave exactly like android/detector (Kotlin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ScamDetector, loadRules, normalize } from "./detector.js";

const rules = loadRules(JSON.parse(readFileSync(new URL("../../../shared/call_rules.json", import.meta.url))));
const calls = JSON.parse(readFileSync(new URL("../../../android/detector/src/test/resources/eval/calls.json", import.meta.url)));
const run = (...phrases) => { const d = new ScamDetector(rules); let a = d.current(); for (const p of phrases) a = d.add(p); return a; };
const ru = (text, atMs = 0) => ({ text, atMs, source: "ru" });
const kk = (text, atMs = 0) => ({ text, atMs, source: "kk" });
const has = (a, id) => a.hits.some((h) => h.rule.id === id);

test("frozen evaluation set: every scam HIGH, no normal HIGH", () => {
  for (const c of calls) {
    const level = run(...c.phrases.map((t, i) => ({ text: t, atMs: i * 4000, source: c.lang === "kk" ? "kk" : "ru" }))).level;
    if (c.label === "scam") assert.equal(level, "HIGH", c.id);
    else assert.notEqual(level, "HIGH", c.id);
  }
});

test("levels by stage", () => {
  assert.equal(run(ru("здравствуйте вас беспокоит служба безопасности банка")).level, "LOW");
  assert.equal(run(ru("переведите деньги на безопасный счет")).level, "HIGH");
  assert.equal(run(kk("смс кодты айтыңызшы")).level, "HIGH");
  assert.equal(run(ru("на вас оформили кредит"), ru("нужно перевести деньги", 1000)).level, "HIGH");
  assert.equal(run(ru("это полиция"), ru("никому не говорите об этом", 1000)).level, "SUSPICIOUS");
});

test("negation is scoped, split and cross-recogniser", () => {
  assert.equal(run(ru("никому не сообщайте код из смс")).hits.length, 0);
  assert.equal(run(kk("кодты ешкімге айтпаңыз")).hits.length, 0);
  assert.equal(run(ru("продиктуйте код из смс и никому не говорите")).level, "HIGH");
  assert.equal(run(ru("банк никогда не просит код назовите код из смс")).level, "HIGH");
  assert.ok(!has(run(ru("никому не сообщайте", 0), ru("код из смс", 1500)), "req_code"));
  assert.ok(!has(run(ru("никому не сообщайте код из смс", 0), kk("код из смс", 100)), "req_code"));
  assert.ok(!has(run(kk("код из смс", 0), ru("никому не сообщайте код из смс", 100)), "req_code"));
  assert.equal(run(ru("никому не сообщайте код", 0), ru("а теперь назовите код из смс", 20000)).level, "HIGH");
});

test("a 'safe accounts do not exist' warning is not a request", () =>
  assert.equal(run(ru("безопасных счетов не существует")).hits.length, 0));

test("no false alarms on family talk", () => {
  assert.ok(!run(ru("мам не говори папе")).stages.has("AUTHORITY"));
  assert.equal(run(ru("мам какой пароль от вайфая")).level, "LOW");
  assert.notEqual(run(ru("мама это я"), ru("я тебе завтра переведу деньги", 3000)).level, "HIGH");
  assert.equal(run(ru("назовите пароль от приложения банка")).level, "HIGH");
});

test("normalize", () => assert.equal(normalize("Счёт  БЛОКИРОВАН!"), "счет блокирован"));

test("Claude merge: one step up at most, never down", async () => {
  const { merge } = await import("./analyst.js");
  assert.equal(merge("LOW", "HIGH"), "SUSPICIOUS");
  assert.equal(merge("SUSPICIOUS", "HIGH"), "HIGH");
  assert.equal(merge("HIGH", "LOW"), "HIGH");
  assert.equal(merge("LOW", null), "LOW");
});

test("100 demo calls as dialogs (caller + client replies): every scam HIGH, no real call HIGH", () => {
  const load = (f) => JSON.parse(readFileSync(new URL(`../../../shared/${f}`, import.meta.url)));
  const replies = load("demo_replies.json");
  for (const [file, scam] of [["demo_calls_scam.json", true], ["demo_calls_legit.json", false]]) {
    const list = load(file);
    assert.equal(list.length, 50);
    for (const c of list) {
      let t = 0;
      const phrases = c.lines.flatMap((line, i) => [
        { text: line, atMs: (t += 4000), source: c.lang },
        ...(replies[c.id]?.[i] ? [{ text: replies[c.id][i], atMs: (t += 2000), source: c.lang }] : []),
      ]);
      const level = run(...phrases).level;
      if (scam) assert.equal(level, "HIGH", c.id); else assert.notEqual(level, "HIGH", c.id);
    }
  }
});
