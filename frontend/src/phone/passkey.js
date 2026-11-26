// Browser side of passkeys: create one on this device, and sign a transfer's details with it.
import { api } from "../i18n.js";

const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const toB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const passkeySupported = () => typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials?.create);

/** Creates a passkey (Face ID / Touch ID / Windows Hello) and registers its public key with the bank. */
export async function registerPasskey(persona) {
  const b = await api("/api/passkey/register/begin", { persona });
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: toBuf(b.challenge), rp: { name: b.rp_name }, user: { id: toBuf(b.user_id), name: b.user_name, displayName: b.user_name },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { userVerification: "required", residentKey: "preferred" }, attestation: "none", timeout: 60000,
  } });
  return api("/api/passkey/register/finish", { persona, credential_id: toB64u(cred.rawId), public_key: toB64u(cred.response.getPublicKey()),
    alg: cred.response.getPublicKeyAlgorithm(), client_data_json: toB64u(cred.response.clientDataJSON) });
}

/** What the client would sign for this transfer, or null when they have no passkey. */
export async function passkeyChallenge(txId) {
  const c = await api("/api/passkey/challenge", { tx_id: txId });
  return c.required ? c : null;
}

/** Signs the transfer's details with the passkey; the bank checks the signature. */
export async function signWithPasskey(txId, c) {
  const a = await navigator.credentials.get({ publicKey: {
    challenge: toBuf(c.challenge), allowCredentials: c.credential_ids.map((id) => ({ type: "public-key", id: toBuf(id) })),
    userVerification: "required", timeout: 60000,
  } });
  return api("/api/passkey/verify", { tx_id: txId, credential_id: toB64u(a.rawId), authenticator_data: toB64u(a.response.authenticatorData),
    client_data_json: toB64u(a.response.clientDataJSON), signature: toB64u(a.response.signature) });
}
