// Sanity check: the JS port must reproduce XGBoost's pred_contribs.  Run: node check.mjs
import { readFileSync } from "node:fs";
import { explain } from "./shap.js";
const data = JSON.parse(readFileSync(new URL("./data.json", import.meta.url)));
let worst = 0;
for (const p of data.probe) {
  const r = explain(data, p.x);
  worst = Math.max(worst, Math.abs(r.margin - p.margin), ...p.phi.map((v, i) => Math.abs(v - r.contrib[data.features[i]])));
}
console.log("max abs diff vs xgboost pred_contribs:", worst.toExponential(2));
process.exit(worst < 1e-3 ? 0 : 1);
