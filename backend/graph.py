"""Drop-account (money mule) detection on a transaction graph.

Graph features per account: pass-through ratio, hold time between money in and money out,
fan-in, account age. Suspicious accounts are grouped into networks (connected components).
"""
from collections import defaultdict

import networkx as nx
import numpy as np

DEMO_DROP_ACCOUNT = "KZ86 •••• 4471"   # the "safe account" a scammer dictates in the mobile demo


def _acc(rng):
    return f"KZ{rng.integers(10, 99)} •••• {rng.integers(1000, 9999)}"


def generate_transactions(seed=11):
    rng = np.random.default_rng(seed)
    accounts, txs = {}, []
    normal = []
    for _ in range(150):
        a = _acc(rng)
        accounts[a] = {"age_days": int(rng.exponential(700) + 60), "truth": "normal"}
        normal.append(a)
    for _ in range(330):  # ordinary life: salaries, shops, friends
        s, r = rng.choice(normal, 2, replace=False)
        txs.append({"src": str(s), "dst": str(r), "amount": float(round(rng.lognormal(10, 0.9), -2)),
                    "t": float(rng.uniform(0, 7 * 24 * 60))})
    for ring in range(3):  # three laundering rings
        t0 = float(rng.uniform(600, 6 * 24 * 60))
        l1 = [_acc(rng) for _ in range(int(rng.integers(2, 4)))]
        if ring == 0:
            l1[0] = DEMO_DROP_ACCOUNT
        l2 = [_acc(rng) for _ in range(int(rng.integers(1, 3)))]
        cash = _acc(rng)
        for a in l1 + l2 + [cash]:
            accounts[a] = {"age_days": int(rng.integers(2, 25)), "truth": "drop"}
        for d in l1:
            got = 0.0
            last_in = t0
            for _ in range(int(rng.integers(2, 5))):
                v = str(rng.choice(normal))
                amt = float(round(rng.lognormal(13.2, 0.5), -3))
                last_in = t0 + float(rng.uniform(0, 90))
                txs.append({"src": v, "dst": d, "amount": amt, "t": last_in})
                got += amt
            nxt = str(rng.choice(l2))
            txs.append({"src": d, "dst": nxt, "amount": round(got * 0.97, -2), "t": t0 + 90 + float(rng.uniform(2, 15))})
        for d in l2:
            got = sum(t["amount"] for t in txs if t["dst"] == d)
            if got:
                txs.append({"src": d, "dst": cash, "amount": round(got * 0.97, -2), "t": t0 + 108 + float(rng.uniform(2, 15))})
    return accounts, txs


def analyse(accounts, txs):
    g = nx.MultiDiGraph()
    for t in txs:
        g.add_edge(t["src"], t["dst"], amount=t["amount"], t=t["t"])
    ins, outs = defaultdict(list), defaultdict(list)
    for t in txs:
        ins[t["dst"]].append(t)
        outs[t["src"]].append(t)

    stats = {}
    for a in g.nodes:
        i_sum = sum(t["amount"] for t in ins[a])
        o_sum = sum(t["amount"] for t in outs[a])
        passthrough = min(i_sum, o_sum) / max(i_sum, o_sum) if i_sum and o_sum else 0.0
        holds = []
        for o in outs[a]:
            prev = [o["t"] - i["t"] for i in ins[a] if i["t"] <= o["t"]]
            if prev:
                holds.append(min(prev))
        hold = float(np.median(holds)) if holds else None
        age = accounts.get(a, {}).get("age_days", 365)
        fan_in = len({t["src"] for t in ins[a]})
        score = (0.40 * (passthrough if i_sum > 300_000 else passthrough * 0.3)
                 + 0.30 * (1.0 if hold is not None and hold < 30 else 0.3 if hold is not None and hold < 240 else 0.0)
                 + 0.20 * (1.0 if age < 30 else 0.0)
                 + 0.10 * min(fan_in / 3, 1.0))
        stats[a] = {"in_sum": i_sum, "out_sum": o_sum, "in_cnt": len(ins[a]), "out_cnt": len(outs[a]),
                    "fan_in": fan_in, "passthrough": round(passthrough, 2),
                    "hold_min": None if hold is None else round(hold, 1), "age_days": age,
                    "score": round(score, 2)}

    flagged = {a for a, s in stats.items() if s["score"] >= 0.6}
    # cash-out endpoints: young accounts fed almost only by flagged accounts
    for a, s in stats.items():
        if a not in flagged and s["in_sum"] and s["age_days"] < 30:
            from_flagged = sum(t["amount"] for t in ins[a] if t["src"] in flagged)
            if from_flagged / s["in_sum"] > 0.7:
                flagged.add(a)
                s["score"] = max(s["score"], 0.75)
                s["cashout"] = True

    und = nx.Graph()
    und.add_nodes_from(flagged)
    for t in txs:
        if t["src"] in flagged and t["dst"] in flagged:
            und.add_edge(t["src"], t["dst"])
    networks, node_net = [], {}
    for idx, comp in enumerate(sorted(nx.connected_components(und), key=len, reverse=True), 1):
        victims = {t["src"] for t in txs if t["dst"] in comp and t["src"] not in flagged}
        stolen = sum(t["amount"] for t in txs if t["dst"] in comp and t["src"] not in flagged)
        for a in comp:
            node_net[a] = idx
        networks.append({"id": idx, "accounts": sorted(comp), "size": len(comp),
                         "victims": len(victims), "volume": stolen,
                         "avg_hold_min": round(float(np.mean([stats[a]["hold_min"] for a in comp
                                                            if stats[a]["hold_min"] is not None] or [0])), 1)})

    nodes, edges = [], []
    victims_all = {t["src"] for t in txs if t["dst"] in flagged and t["src"] not in flagged}
    for a, s in stats.items():
        role = ("cashout" if s.get("cashout") else "drop") if a in flagged else "victim" if a in victims_all else "normal"
        nodes.append({"id": a, "role": role, "network": node_net.get(a), **s})
    for t in txs:
        edges.append({"from": t["src"], "to": t["dst"], "amount": t["amount"], "t": round(t["t"]),
                      "suspicious": t["dst"] in flagged})
    truth = {a for a, m in accounts.items() if m["truth"] == "drop"}
    quality = {"precision": round(len(flagged & truth) / max(len(flagged), 1), 2),
               "recall": round(len(flagged & truth) / max(len(truth), 1), 2),
               "flagged": len(flagged), "accounts": len(stats)}
    return {"nodes": nodes, "edges": edges, "networks": networks, "quality": quality}


def build():
    accounts, txs = generate_transactions()
    return analyse(accounts, txs)


if __name__ == "__main__":
    r = build()
    print(r["quality"], [(n["size"], n["victims"], n["volume"], n["avg_hold_min"]) for n in r["networks"]])
    print([n for n in r["nodes"] if n["id"] == DEMO_DROP_ACCOUNT])
