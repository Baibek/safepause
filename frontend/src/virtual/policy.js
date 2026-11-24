// Senim Saqshy risk policy in the browser: the same function as backend/policy.py, from shared/risk_policy.json.
// shared/policy_cases.json is checked against both (policy.test.mjs, backend/test_policy.py).
import POLICY from "../../../shared/risk_policy.json" with { type: "json" };

export { POLICY };
const ORDER = Object.keys(POLICY.signals);

function hits(f) {
  const S = POLICY.signals, out = [];
  const add = (key, points, v = {}) => out.push([key, points, v]);
  const modelPts = Math.round(S.model.weight * (f.model_risk || 0));
  if (modelPts > 0) add("model", modelPts);
  const m = f.scam_call_minutes;
  if (m != null && m >= 0 && m <= S.scam_call.window_min) add("scam_call", S.scam_call.points);
  if (f.drop_list) add("drop_list", S.drop_list.points);
  const loan = f.loan_minutes_ago;
  if (f.new_device && loan != null && loan >= 0 && loan <= S.loan_new_device.window_min) add("loan_new_device", S.loan_new_device.points);
  if (f.remote_access) add("remote_access", S.remote_access.points);
  const ratio = Number(f.amount_ratio) || 0;
  if (ratio >= S.amount_extreme.ratio) add("amount_extreme", S.amount_extreme.points, { r: Math.round(ratio) });
  else if (ratio >= S.amount_unusual.ratio) add("amount_unusual", S.amount_unusual.points, { r: Math.round(ratio) });
  if (f.other_bank && (f.amount || 0) >= S.other_bank.min_amount) add("other_bank", S.other_bank.points);
  const n = f.senders_last_hour || 0;
  if (n >= S.fan_in.senders) add("fan_in", S.fan_in.points, { n });
  if (f.name_match === "mismatch") add("name_mismatch", S.name_mismatch.points);
  if (f.on_call) add("active_call", S.active_call.points);
  if (f.new_device) add("new_device", S.new_device.points);
  if (f.rooted) add("rooted", S.rooted.points);
  if (f.on_call && f.unknown_caller) add("unknown_caller", S.unknown_caller.points);
  if (f.new_recipient) add("new_recipient", S.new_recipient.points);
  if (f.name_match === "partial") add("name_partial", S.name_partial.points);
  if (f.pasted) add("pasted_details", S.pasted_details.points);
  if ((f.typing_pause_ms || 0) >= S.dictated_typing.pause_ms) add("dictated_typing", S.dictated_typing.points);
  if (f.hour != null && f.hour >= S.night.from_hour && f.hour < S.night.to_hour) add("night", S.night.points);
  if (f.vpn) add("vpn", S.vpn.points);
  return out;
}

const fill = (s, v) => s.replace("{r}", v.r ?? "").replace("{n}", v.n ?? "");

export function evaluate(f) {
  const S = POLICY.signals, T = POLICY.thresholds, C = POLICY.cooling;
  const hs = hits(f).sort((a, b) => b[1] - a[1] || ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  let score = Math.min(100, hs.reduce((a, h) => a + h[1], 0));
  for (const [k] of hs) score = Math.max(score, S[k].min_score || 0);
  const tier = score >= T.escalate ? "escalate" : score >= T.cool ? "cool" : score >= T.warn ? "warn" : "pass";
  const keys = new Set(hs.map((h) => h[0]));
  let cooling = null;
  if (tier === "cool") cooling = { minutes: C.cool_minutes, reason: "cool" };
  if (tier !== "escalate") {
    if (keys.has("loan_new_device")) cooling = { minutes: Math.max(C.loan_new_device_minutes, cooling?.minutes || 0), reason: "loan_new_device" };
    else if ((tier === "pass" || tier === "warn") && keys.has("new_recipient") && (f.amount || 0) >= C.new_recipient_min_amount)
      cooling = { minutes: C.new_recipient_minutes, reason: "new_recipient" };
  }
  const signals = hs.map(([key, points, v]) => ({ key, points, kk: fill(S[key].kk, v), ru: fill(S[key].ru, v) }));
  return { score, tier, signals, cooling };
}
