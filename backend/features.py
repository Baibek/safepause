"""Feature schema shared by data generation, training and online scoring."""
import math

FEATURES = [
    "amount", "amount_ratio", "drain_ratio", "new_recipient", "hour", "is_night",
    "on_call", "unknown_caller", "remote_app", "session_dev", "client_age",
    "recipient_age_days", "recipient_drop_score", "tx_24h",
]

TYPICAL_SESSION_SEC = 45.0


def build_features(amount, avg_amount, balance, new_recipient, hour, on_call,
                   unknown_caller, remote_app, session_seconds, client_age,
                   recipient_age_days, recipient_drop_score, tx_24h):
    return {
        "amount": float(amount),
        "amount_ratio": float(amount) / max(avg_amount, 1.0),
        "drain_ratio": min(float(amount) / max(balance, 1.0), 1.0),
        "new_recipient": int(new_recipient),
        "hour": int(hour),
        "is_night": int(hour >= 23 or hour < 6),
        "on_call": int(on_call),
        "unknown_caller": int(on_call and unknown_caller),
        "remote_app": int(remote_app),
        "session_dev": abs(math.log(max(session_seconds, 1.0) / TYPICAL_SESSION_SEC)),
        "client_age": int(client_age),
        "recipient_age_days": float(recipient_age_days),
        "recipient_drop_score": float(recipient_drop_score),
        "tx_24h": int(tx_24h),
    }
