// Federated learning between banks (FedAvg, McMahan et al. 2017) on synthetic data, small enough to run in the browser.
// Three banks each see one fraud scheme: A phone-call scams, B remote control, C transfers to drop accounts.
// Each trains a logistic regression on its own data; only the model weights (7 numbers) go to the coordinator,
// which averages them by sample count. Client data never leaves a bank.
export const FEATURES = ["new_recipient", "amount", "on_call", "remote", "drop", "night"];
export const SCHEMES = ["call", "remote", "drop"];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function sample(r, kind) {
  const b = (p) => (r() < p ? 1 : 0), x = { new_recipient: b(0.2), amount: r() * 0.4, on_call: b(0.08), remote: b(0.02), drop: r() * 0.15, night: b(0.1) };
  if (kind === "call") Object.assign(x, { on_call: 1, new_recipient: b(0.9), amount: 0.5 + r() * 0.5 });
  if (kind === "remote") Object.assign(x, { remote: 1, amount: 0.3 + r() * 0.6, night: b(0.4) });
  if (kind === "drop") Object.assign(x, { drop: 0.6 + r() * 0.4, new_recipient: b(0.95) });
  return { x: FEATURES.map((f) => x[f]), y: kind === "normal" ? 0 : 1, kind };
}

/** Three banks' private datasets and a shared test set with all schemes (for evaluation only). */
export function makeBanks(seed = 7, n = 600) {
  const r = rng(seed);
  const bank = (name, scheme) => ({ name, scheme, data: Array.from({ length: n }, (_, i) => sample(r, i % 6 === 0 ? scheme : "normal")) });
  const test = Array.from({ length: 1200 }, (_, i) => sample(r, i % 4 === 0 ? SCHEMES[(i / 4) % 3] : "normal"));
  return { banks: [bank("A", "call"), bank("B", "remote"), bank("C", "drop")], test };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const predict = (w, x) => sigmoid(w[0] + x.reduce((a, v, i) => a + v * w[i + 1], 0));

/** A few epochs of gradient descent from the given weights on one bank's own data. */
export function trainLocal(w0, data, epochs = 20, lr = 0.5) {
  const w = [...w0];
  for (let e = 0; e < epochs; e++) {
    const g = new Array(w.length).fill(0);
    for (const { x, y } of data) {
      const err = predict(w, x) - y;
      g[0] += err; x.forEach((v, i) => { g[i + 1] += err * v; });
    }
    for (let i = 0; i < w.length; i++) w[i] -= (lr * g[i]) / data.length;
  }
  return w;
}

export function auc(w, test) {
  const s = test.map((t) => [predict(w, t.x), t.y]).sort((a, b) => a[0] - b[0]);
  let rank = 0, pos = 0, sumPos = 0;
  s.forEach(([, y], i) => { rank = i + 1; if (y) { pos++; sumPos += rank; } });
  const neg = s.length - pos;
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

export const FALSE_PAUSE = 0.05;   // every model is compared at the same cost: 5% of honest transfers paused

/** Share of each scheme caught when the model pauses at most FALSE_PAUSE of honest transfers. */
export function caught(w, test) {
  const normal = test.filter((t) => !t.y).map((t) => predict(w, t.x)).sort((a, b) => a - b);
  const cut = normal[Math.floor(normal.length * (1 - FALSE_PAUSE))];
  return Object.fromEntries(SCHEMES.map((k) => {
    const xs = test.filter((t) => t.kind === k);
    return [k, xs.filter((t) => predict(w, t.x) > cut).length / xs.length];
  }));
}

/** Runs FedAvg. Returns each bank's local-only model, the federated model per round, and what was sent. */
export function runFederated({ seed = 7, rounds = 5, localEpochs = 20 } = {}) {
  const { banks, test } = makeBanks(seed);
  const d = FEATURES.length + 1, zero = new Array(d).fill(0);
  const local = banks.map((b) => {
    const w = trainLocal(zero, b.data, rounds * localEpochs);
    return { name: b.name, scheme: b.scheme, auc: auc(w, test), caught: caught(w, test) };
  });
  let g = zero;
  const history = [], sent = [];
  const total = banks.reduce((a, b) => a + b.data.length, 0);
  for (let r = 1; r <= rounds; r++) {
    const updates = banks.map((b) => trainLocal(g, b.data, localEpochs));
    updates.forEach((w, i) => sent.push({ round: r, bank: banks[i].name, weights: w.map((v) => Math.round(v * 1000) / 1000) }));
    g = g.map((_, j) => updates.reduce((a, w, i) => a + (w[j] * banks[i].data.length) / total, 0));
    history.push({ round: r, auc: auc(g, test), caught: caught(g, test) });
  }
  return { local, federated: history[history.length - 1], history, sent, weightsPerMessage: d,
    records: banks.reduce((a, b) => a + b.data.length, 0) };
}
