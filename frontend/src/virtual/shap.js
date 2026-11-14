// Tree ensemble scoring + exact TreeSHAP (Lundberg et al., Algorithm 2) for the exported XGBoost trees.
const copy = (p) => p.map((e) => ({ ...e }));

function extend(m, pz, po, pi) {
  const l = m.length;
  m.push({ d: pi, z: pz, o: po, w: l === 0 ? 1 : 0 });
  for (let i = l - 1; i >= 0; i--) {
    m[i + 1].w += (po * m[i].w * (i + 1)) / (l + 1);
    m[i].w = (pz * m[i].w * (l - i)) / (l + 1);
  }
}

function unwind(m, i) {
  const l = m.length - 1, o = m[i].o, z = m[i].z;
  let n = m[l].w;
  for (let j = l - 1; j >= 0; j--) {
    if (o !== 0) {
      const t = m[j].w;
      m[j].w = (n * (l + 1)) / ((j + 1) * o);
      n = t - (m[j].w * z * (l - j)) / (l + 1);
    } else m[j].w = (m[j].w * (l + 1)) / (z * (l - j));
  }
  for (let j = i; j < l; j++) { m[j].d = m[j + 1].d; m[j].z = m[j + 1].z; m[j].o = m[j + 1].o; }
  m.pop();
}

function unwoundSum(m, i) {
  const l = m.length - 1, o = m[i].o, z = m[i].z;
  let n = m[l].w, total = 0;
  for (let j = l - 1; j >= 0; j--) {
    if (o !== 0) {
      const t = (n * (l + 1)) / ((j + 1) * o);
      total += t;
      n = m[j].w - (t * z * (l - j)) / (l + 1);
    } else total += m[j].w / z / ((l - j) / (l + 1));
  }
  return total;
}

function recurse(node, x, phi, path, pz, po, pi) {
  path = copy(path);
  extend(path, pz, po, pi);
  if (node.v !== undefined) {
    for (let i = 1; i < path.length; i++) phi[path[i].d] += unwoundSum(path, i) * (path[i].o - path[i].z) * node.v;
    return;
  }
  const val = x[node.f];
  const yes = val === undefined || Number.isNaN(val) ? node.m : val < node.t;
  const hot = yes ? node.y : node.n, cold = yes ? node.n : node.y;
  let iz = 1, io = 1;
  const k = path.findIndex((e, idx) => idx > 0 && e.d === node.f);
  if (k > 0) { iz = path[k].z; io = path[k].o; unwind(path, k); }
  recurse(hot, x, phi, path, (iz * hot.c) / node.c, io, node.f);
  recurse(cold, x, phi, path, (iz * cold.c) / node.c, 0, node.f);
}

export function explain(model, feats) {
  const x = model.features.map((f) => feats[f]);
  const phi = new Array(x.length).fill(0);
  for (const tree of model.trees) recurse(tree, x, phi, [], 1, 1, -1);
  const margin = phi.reduce((a, b) => a + b, model.bias);
  return { risk: 1 / (1 + Math.exp(-margin)), margin, contrib: Object.fromEntries(model.features.map((f, i) => [f, phi[i]])) };
}
