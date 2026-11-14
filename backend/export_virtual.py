"""Exports everything the serverless (virtual) web app needs into one JSON file:
the trained trees, graph analysis, seed transactions, demo data and texts."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

import main
from features import FEATURES

OUT = Path(__file__).parent.parent / "frontend" / "src" / "virtual" / "data.json"


def pack(node):
    if "leaf" in node:
        return {"v": node["leaf"], "c": node["cover"]}
    kids = {k["nodeid"]: k for k in node["children"]}
    return {"f": FEATURES.index(node["split"]), "t": node["split_condition"], "c": node["cover"],
            "y": pack(kids[node["yes"]]), "n": pack(kids[node["no"]]), "m": node["missing"] == node["yes"]}


trees = [pack(json.loads(t)) for t in main.booster.get_dump(dump_format="json", with_stats=True)]
seed = json.loads((main.HERE / "seed_transactions.json").read_text())
probe = pd.DataFrame(seed)[FEATURES]
contrib = main.booster.predict(xgb.DMatrix(probe), pred_contribs=True)
OUT.write_text(json.dumps({
    "features": FEATURES, "trees": trees, "bias": float(np.median(contrib[:, -1])),
    "probe": [{"x": seed[i], "margin": float(contrib[i].sum()), "phi": [float(v) for v in contrib[i][:-1]]}
              for i in range(5)],
    "seed": seed, "metrics": main.METRICS, "graph": main.GRAPH,
    "personas": list(main.PERSONAS.values()), "recipients": main.RECIPIENTS,
    "factor": main.FACTOR, "questions": main.QUESTIONS, "texts": main.T,
    "thresholds": {"pause": main.PAUSE_AT, "high": main.HIGH_AT},
    "guardian_min_amount": main.GUARDIAN_MIN_AMOUNT,
}, ensure_ascii=False, separators=(",", ":")))
print(OUT, round(OUT.stat().st_size / 1024), "KB")
