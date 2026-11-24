// Federated learning demo: the shared model catches every bank's scheme; only weights are exchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runFederated, FEATURES } from "./federated.js";

test("federated model beats every local-only model on the shared test set", () => {
  const r = runFederated();
  for (const l of r.local) assert.ok(r.federated.auc > l.auc + 0.02, `${l.name}: ${l.auc} vs ${r.federated.auc}`);
});

test("each local model misses the schemes it never saw; the federated one catches all three", () => {
  const r = runFederated();
  for (const l of r.local) {
    const others = Object.entries(l.caught).filter(([k]) => k !== l.scheme).map(([, v]) => v);
    assert.ok(Math.min(...others) < 0.5, `${l.name} should miss a foreign scheme`);
  }
  assert.ok(Object.values(r.federated.caught).every((v) => v >= 0.8), JSON.stringify(r.federated.caught));
});

test("only model weights leave a bank", () => {
  const r = runFederated({ rounds: 3 });
  assert.equal(r.sent.length, 9);
  assert.ok(r.sent.every((m) => m.weights.length === FEATURES.length + 1 && Object.keys(m).join() === "round,bank,weights"));
});
