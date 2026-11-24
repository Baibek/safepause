"""Minimal WebAuthn (passkey) checks for Senim Saqshy: registration and assertion, ES256 and RS256.

The browser sends the credential's public key as SPKI (PublicKeyCredential.response.getPublicKey()), so no CBOR is
needed. What the client signs is the transfer itself (WYSIWYS): the challenge is the SHA-256 of the transfer's
canonical details, so a code cannot be dictated to a scammer and changed details break the signature.
"""
import base64
import hashlib
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa

ES256, RS256 = -7, -257


class PasskeyError(ValueError):
    pass


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def tx_challenge(details: dict) -> bytes:
    """The bytes the client signs for a transfer: SHA-256 of its canonical details."""
    canonical = json.dumps(details, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).digest()


def _client_data(client_data_json: str, kind: str, challenge: bytes, rp_id: str) -> bytes:
    raw = unb64u(client_data_json)
    cd = json.loads(raw)
    if cd.get("type") != kind:
        raise PasskeyError("wrong ceremony type")
    if unb64u(cd.get("challenge", "")) != challenge:
        raise PasskeyError("challenge does not match")
    host = cd.get("origin", "").split("://")[-1].split(":")[0]
    if host != rp_id:
        raise PasskeyError("origin does not match")
    return raw


def verify_registration(client_data_json: str, challenge: bytes, rp_id: str, public_key_spki: str, alg: int):
    _client_data(client_data_json, "webauthn.create", challenge, rp_id)
    key = serialization.load_der_public_key(unb64u(public_key_spki))
    if alg == ES256 and not isinstance(key, ec.EllipticCurvePublicKey) or alg == RS256 and not isinstance(key, rsa.RSAPublicKey):
        raise PasskeyError("key type does not match the algorithm")
    if alg not in (ES256, RS256):
        raise PasskeyError("unsupported algorithm")


def verify_assertion(public_key_spki: str, alg: int, authenticator_data: str, client_data_json: str, signature: str,
                     challenge: bytes, rp_id: str):
    raw_cd = _client_data(client_data_json, "webauthn.get", challenge, rp_id)
    auth = unb64u(authenticator_data)
    if len(auth) < 37 or auth[:32] != hashlib.sha256(rp_id.encode()).digest():
        raise PasskeyError("relying party does not match")
    if not auth[32] & 0x01:
        raise PasskeyError("user presence missing")
    signed = auth + hashlib.sha256(raw_cd).digest()
    key = serialization.load_der_public_key(unb64u(public_key_spki))
    try:
        if alg == ES256:
            key.verify(unb64u(signature), signed, ec.ECDSA(hashes.SHA256()))
        elif alg == RS256:
            key.verify(unb64u(signature), signed, padding.PKCS1v15(), hashes.SHA256())
        else:
            raise PasskeyError("unsupported algorithm")
    except InvalidSignature as e:
        raise PasskeyError("signature is not valid") from e
    return {"user_verified": bool(auth[32] & 0x04)}
