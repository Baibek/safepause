"""Passkey (WebAuthn) confirmation of a transfer: the client signs the transfer's own details, not a code."""
import hashlib
import json
import os

os.environ["SAFEPAUSE_LLM"] = "off"
import pytest  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from webauthn import b64u, unb64u  # noqa: E402

client = TestClient(main.app)
ORIGIN, RP = "http://testserver", "testserver"


class Authenticator:
    """A software passkey: what Touch ID / Face ID does, with an EC P-256 key."""
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.id = b64u(os.urandom(16))

    def public_spki(self):
        return b64u(self.key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo))

    @staticmethod
    def client_data(kind, challenge, origin=ORIGIN):
        return b64u(json.dumps({"type": kind, "challenge": challenge, "origin": origin}).encode())

    def sign(self, challenge, rp=RP, flags=0x05, tamper=None):
        cd = self.client_data("webauthn.get", challenge)
        auth = hashlib.sha256(rp.encode()).digest() + bytes([flags]) + (1).to_bytes(4, "big")
        sig = self.key.sign(auth + hashlib.sha256(unb64u(cd)).digest(), ec.ECDSA(hashes.SHA256()))
        return {"credential_id": self.id, "authenticator_data": b64u(auth), "client_data_json": cd,
                "signature": b64u(sig if not tamper else sig[:-1] + bytes([sig[-1] ^ 1]))}


@pytest.fixture(autouse=True)
def fresh():
    client.post("/api/demo/reset", json={})


def enroll(a, persona="daniyar"):
    begin = client.post("/api/passkey/register/begin", json={"persona": persona}).json()
    return client.post("/api/passkey/register/finish", json={
        "persona": persona, "credential_id": a.id, "public_key": a.public_spki(), "alg": -7,
        "client_data_json": a.client_data("webauthn.create", begin["challenge"])})


def verify_call_tx(persona="daniyar"):
    r = client.post("/api/transfer/check", json={"persona": persona, "recipient_id": "new_clean", "amount": 60000,
                                                 "other_bank": True, "lang": "kk", "signals": {}}).json()
    assert r["action"] == "verify"
    return r["tx_id"]


def test_enrolment_raises_the_security_index():
    s = enroll(Authenticator()).json()
    assert s["passkey"] and s["index"] == 35


def test_enrolment_rejects_a_wrong_origin():
    a = Authenticator()
    begin = client.post("/api/passkey/register/begin", json={"persona": "daniyar"}).json()
    r = client.post("/api/passkey/register/finish", json={"persona": "daniyar", "credential_id": a.id, "public_key": a.public_spki(),
                                                          "alg": -7, "client_data_json": a.client_data("webauthn.create", begin["challenge"], "https://evil.example")})
    assert r.status_code == 400


def test_signed_transfer_goes_through_the_verification_call():
    a = Authenticator(); enroll(a)
    tx = verify_call_tx()
    assert client.post("/api/verify/respond", json={"tx_id": tx, "answer": "self"}).status_code == 403   # pressing 1 is not enough
    ch = client.post("/api/passkey/challenge", json={"tx_id": tx}).json()
    assert ch["required"] and ch["details"]["amount"] == 60000
    assert client.post("/api/passkey/verify", json={"tx_id": tx, **a.sign(ch["challenge"])}).json()["user_verified"]
    assert client.post("/api/verify/respond", json={"tx_id": tx, "answer": "self"}).json()["final"]["decision"] == "approved"


def test_tampered_signature_or_other_details_fail():
    a = Authenticator(); enroll(a)
    tx = verify_call_tx()
    ch = client.post("/api/passkey/challenge", json={"tx_id": tx}).json()
    assert client.post("/api/passkey/verify", json={"tx_id": tx, **a.sign(ch["challenge"], tamper=True)}).status_code == 403
    # a signature made for other details (an attacker swaps the recipient) does not match this transfer
    other = b64u(main.webauthn.tx_challenge({**ch["details"], "recipient": "KZ00 •••• 0000"}))
    assert client.post("/api/passkey/verify", json={"tx_id": tx, **a.sign(other)}).status_code == 403


def test_another_device_cannot_sign():
    enroll(Authenticator())
    tx = verify_call_tx()
    ch = client.post("/api/passkey/challenge", json={"tx_id": tx}).json()
    assert client.post("/api/passkey/verify", json={"tx_id": tx, **Authenticator().sign(ch["challenge"])}).status_code == 403


def test_clients_without_a_passkey_are_not_asked():
    tx = verify_call_tx()
    assert client.post("/api/passkey/challenge", json={"tx_id": tx}).json() == {"required": False}
    assert client.post("/api/verify/respond", json={"tx_id": tx, "answer": "self"}).json()["final"]["decision"] == "approved"
