// Browser port of android/detector (Kotlin ScamDetector). Same rules file, same behaviour;
// detector.test.mjs runs the frozen evaluation set against both.

const NON_WORD = /[^\p{L}\p{Nd}]+/gu;
export const normalize = (text) => text.toLowerCase().replaceAll("ё", "е").replace(NON_WORD, " ").trim();
const squash = (text) => normalize(text).replaceAll(" ", "");

export const STAGES = ["AUTHORITY", "THREAT", "REQUEST", "ISOLATION"];
const WINDOW_MS = 4000;
const SPAN = 45;
const IMPERATIVE = /назовит|назови|продиктуй|скажит|скажи|сообщит|айтыңыз|айтыңызшы|айтып|жіберіңіз|жіберші|переведит|аударыңыз|введит/gu;

const rx = (p) => new RegExp(p, "gu");
const wordRx = (p) => new RegExp(`(?<![\\p{L}\\p{Nd}])(?:${p})(?![\\p{L}\\p{Nd}])`, "gu");

export function loadRules(json) {
  return json.rules.map((r) => ({
    id: r.id, stage: r.stage, critical: !!r.critical, kk: r.kk, ru: r.ru,
    patterns: r.patterns.map(rx), exclude: (r.exclude || []).map(rx),
    word: (r.word || []).map(wordRx), negate: (r.negate || []).map(rx),
  }));
}

const matches = (re, text) => [...text.matchAll(re)].map((m) => ({ first: m.index, last: m.index + m[0].length - 1 }));

export class ScamDetector {
  constructor(rules) { this.rules = rules; this.reset(); }

  reset() { this.hits = new Map(); this.history = []; this.negations = []; }

  add(p) {
    const prev = [...this.history].reverse().find((h) => h.source === p.source && p.atMs - h.atMs >= 0 && p.atMs - h.atMs <= WINDOW_MS);
    this.history.push(p);
    const cur = squash(p.text);
    if (!cur) return this.current();
    const before = prev ? squash(prev.text) : "";
    const sq = before + cur;
    const curSpaced = normalize(p.text);
    const sp = (prev ? normalize(prev.text) + " " : "") + curSpaced;
    const spOff = sp.length - curSpaced.length;

    for (const rule of this.rules) {
      const st = this.status(rule, sq, before.length, sp, spOff);
      if (st === "HIT") {
        const cancelled = this.negations.some((n) => n.ruleId === rule.id && n.source !== p.source && Math.abs(n.atMs - p.atMs) <= WINDOW_MS);
        if (!this.hits.has(rule.id) && !cancelled) this.hits.set(rule.id, { rule, phrase: p });
      } else if (st === "NEGATED") {
        this.negations.push({ ruleId: rule.id, source: p.source, atMs: p.atMs });
        const h = this.hits.get(rule.id);
        if (h && h.phrase.source !== p.source && Math.abs(h.phrase.atMs - p.atMs) <= WINDOW_MS) this.hits.delete(rule.id);
      }
    }
    return this.current();
  }

  // Only matches that reach into the current phrase count; the previous phrase is context.
  status(rule, sq, off, sp, spOff) {
    const occ = rule.patterns.flatMap((r) => matches(r, sq)).filter((o) => o.last >= off);
    const wordHit = rule.word.some((r) => matches(r, sp).some((o) => o.last >= spOff));
    if (!occ.length && !wordHit) return "NONE";
    if (rule.exclude.some((r) => { r.lastIndex = 0; return r.test(sq); })) return "NEGATED";
    if (wordHit) return "HIT";
    const spans = rule.negate.flatMap((r) => matches(r, sq)).map((m) => {
      const limit = Math.min(sq.length, m.first + SPAN);
      const cut = matches(IMPERATIVE, sq.slice(m.last + 1)).map((c) => c.first + m.last + 1)
        .find((start) => start < limit && sq.slice(Math.max(0, start - 2), start) !== "не");
      return { first: m.first, last: (cut ?? limit) - 1 };
    });
    const free = occ.some((o) => !spans.some((s) => o.first >= s.first && o.last <= s.last));
    return free ? "HIT" : "NEGATED";
  }

  current() {
    const list = [...this.hits.values()];
    const stages = new Set(list.map((h) => h.rule.stage));
    let level = "LOW";
    if (list.some((h) => h.rule.critical) || (stages.has("REQUEST") && stages.size >= 2) || stages.size >= 3) level = "HIGH";
    else if (stages.has("REQUEST") || stages.size === 2) level = "SUSPICIOUS";
    const base = { LOW: 0.15, SUSPICIOUS: 0.5, HIGH: 0.9 }[level];
    const risk = list.length ? Math.min(1, base + 0.03 * (list.length - 1)) : 0;
    return { level, risk, stages, hits: list };
  }
}
