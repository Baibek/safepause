// WebAuthn (passkey) checks in the browser: the same rules as backend/webauthn.py, with WebCrypto.
// The client signs the transfer's own details (WYSIWYS): challenge = SHA-256 of their canonical JSON.
export class PasskeyError extends Error {}
const enc = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Canonical JSON with sorted keys, like json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False). */
export const canonical = (o) => `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(",")}}`;
export const txChallenge = (details) => sha256(enc.encode(canonical(details)));

function clientData(b64, kind, challenge, rpId) {
  const raw = unb64u(b64), cd = JSON.parse(new TextDecoder().decode(raw));
  if (cd.type !== kind) throw new PasskeyError("wrong ceremony type");
  if (!same(unb64u(cd.challenge || ""), challenge)) throw new PasskeyError("challenge does not match");
  if (String(cd.origin || "").split("://").pop().split(":")[0] !== rpId) throw new PasskeyError("origin does not match");
  return raw;
}

// an ECDSA signature from an authenticator is DER; WebCrypto wants r || s
function derToRaw(der) {
  let i = 2;
  const read = () => { i++; const len = der[i++]; let v = der.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = read(), s = read(), raw = new Uint8Array(64);
  raw.set(r); raw.set(s, 32);
  return raw;
}

const ALG = { "-7": { name: "ECDSA", namedCurve: "P-256" }, "-257": { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } };

export async function verifyRegistration(clientDataB64, challenge, rpId, spkiB64, alg) {
  clientData(clientDataB64, "webauthn.create", challenge, rpId);
  if (!ALG[alg]) throw new PasskeyError("unsupported algorithm");
  await crypto.subtle.importKey("spki", unb64u(spkiB64), ALG[alg], false, ["verify"]).catch(() => { throw new PasskeyError("key type does not match the algorithm"); });
}

export async function verifyAssertion(spkiB64, alg, authDataB64, clientDataB64, signatureB64, challenge, rpId) {
  const rawCd = clientData(clientDataB64, "webauthn.get", challenge, rpId);
  const auth = unb64u(authDataB64);
  if (auth.length < 37 || !same(auth.slice(0, 32), await sha256(enc.encode(rpId)))) throw new PasskeyError("relying party does not match");
  if (!(auth[32] & 0x01)) throw new PasskeyError("user presence missing");
  if (!ALG[alg]) throw new PasskeyError("unsupported algorithm");
  const signed = new Uint8Array([...auth, ...(await sha256(rawCd))]);
  const key = await crypto.subtle.importKey("spki", unb64u(spkiB64), ALG[alg], false, ["verify"]);
  const sig = unb64u(signatureB64);
  const ok = await crypto.subtle.verify(alg === -7 ? { name: "ECDSA", hash: "SHA-256" } : ALG[alg], key, alg === -7 ? derToRaw(sig) : sig, signed);
  if (!ok) throw new PasskeyError("signature is not valid");
  return { user_verified: Boolean(auth[32] & 0x04) };
}
