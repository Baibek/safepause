// The browser port of the risk policy must give the same answer as the server for every shared case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate } from "./policy.js";

const { cases } = JSON.parse(readFileSync(new URL("../../../shared/policy_cases.json", import.meta.url)));
for (const c of cases) {
  test(c.name, () => {
    const r = evaluate(c.facts);
    assert.equal(r.score, c.expect.score);
    assert.equal(r.tier, c.expect.tier);
    assert.deepEqual(r.signals.map((s) => s.key), c.expect.signals);
    assert.deepEqual(r.cooling, c.expect.cooling);
  });
}
