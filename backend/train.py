"""Generate synthetic transfers (PaySim-like + call/device signals) and train the risk model.

Real PaySim / IEEE-CIS data has no "phone call in progress" or "remote access app" signals,
so the MVP simulates them with distributions that follow the social-engineering scenario.
Run:  python train.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split

from features import FEATURES, build_features

HERE = Path(__file__).parent
DAY_HOURS = np.array([0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.5, 3, 5, 6, 6.5, 6.5, 7, 6.5, 6, 6,
                      6, 6.5, 7, 6.5, 5.5, 4, 2.5, 1.2])
DAY_HOURS = DAY_HOURS / DAY_HOURS.sum()


def generate(n=60000, seed=7):
    rng = np.random.default_rng(seed)
    rows = []
    for _ in range(n):
        age = int(np.clip(rng.normal(41, 16), 18, 88))
        avg = float(rng.lognormal(np.log(25000), 0.8))
        balance = avg * float(rng.lognormal(2.3, 0.8))
        fraud = rng.random() < (0.03 + (0.03 if age >= 60 else 0.0))
        if fraud:
            amount = min(avg * rng.lognormal(1.7, 0.7), balance)
            new_rec = rng.random() < 0.93
            hour = int(rng.integers(0, 24)) if rng.random() < 0.45 else int(rng.choice(24, p=DAY_HOURS))
            on_call = rng.random() < 0.75
            unknown = rng.random() < 0.9
            remote = rng.random() < 0.25
            # dictated by the caller (slow) or driven through remote control (very fast)
            sess = rng.lognormal(np.log(170), 0.5) if rng.random() < 0.65 else rng.lognormal(np.log(9), 0.4)
            rec_age = rng.exponential(25) + 1
            drop = rng.beta(4, 3)
            tx24 = rng.poisson(2.5)
        else:
            amount = min(avg * rng.lognormal(0, 0.7), balance)
            new_rec = rng.random() < 0.2
            hour = int(rng.choice(24, p=DAY_HOURS))
            on_call = rng.random() < 0.03
            unknown = rng.random() < 0.3
            remote = rng.random() < 0.004
            sess = rng.lognormal(np.log(45), 0.4)
            rec_age = rng.exponential(700) + 30
            drop = rng.beta(1, 12)
            tx24 = rng.poisson(1.0)
        f = build_features(amount, avg, balance, new_rec, hour, on_call, unknown, remote,
                           sess, age, rec_age, drop, tx24)
        f["is_fraud"] = int(fraud)
        rows.append(f)
    df = pd.DataFrame(rows)
    flip = rng.random(len(df)) < 0.003  # label noise: reality is never clean
    df.loc[flip, "is_fraud"] = 1 - df.loc[flip, "is_fraud"]
    return df


def main():
    df = generate()
    X_tr, X_te, y_tr, y_te = train_test_split(df[FEATURES], df["is_fraud"], test_size=0.25,
                                              random_state=1, stratify=df["is_fraud"])
    model = xgb.XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                              subsample=0.9, colsample_bytree=0.9, eval_metric="logloss")
    model.fit(X_tr, y_tr)
    p = model.predict_proba(X_te)[:, 1]
    flagged = p >= 0.25
    metrics = {
        "rows": int(len(df)),
        "fraud_rate": round(float(df["is_fraud"].mean()), 4),
        "roc_auc": round(float(roc_auc_score(y_te, p)), 4),
        "pr_auc": round(float(average_precision_score(y_te, p)), 4),
        "recall_at_pause": round(float((flagged & (y_te == 1)).sum() / (y_te == 1).sum()), 4),
        "paused_share": round(float(flagged.mean()), 4),
        "false_pause_share": round(float((flagged & (y_te == 0)).sum() / (y_te == 0).sum()), 4),
        "data": "synthetic",
    }
    model.save_model(HERE / "model.json")
    (HERE / "metrics.json").write_text(json.dumps(metrics, indent=2))
    sample = X_te.assign(is_fraud=y_te).sample(60, random_state=3, weights=np.where(y_te == 1, 8, 1))
    sample.to_json(HERE / "seed_transactions.json", orient="records")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
