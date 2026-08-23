import { describe, it, expect, beforeAll } from "vitest";
import { webcrypto } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { resolveRpConfig } from "./webauthn-config";

// ==========================================================================
// Phase G — Protocol-level Regression Test ด้วย "Software Authenticator" (WebCrypto ES256)
// ที่สร้าง Registration/Assertion Response ตาม WebAuthn Spec จริง — ไม่ต้องมี Hardware —
// ทดสอบว่าเส้นทาง Verify ฝั่ง Server (ผ่าน @simplewebauthn/server + RP Config ของเรา)
// ยอมรับเฉพาะ Response ที่: Challenge ตรง, Origin ตรง, RP ID ตรง, ลายเซ็นถูกด้วย Public Key
// ที่ลงทะเบียนไว้, มี User Verification — และปฏิเสธ: Challenge ผิด/Replay, Origin ปลอม,
// RP ID ปลอม, ลายเซ็นจาก Key อื่น, Counter ถอยหลัง (Cloned Authenticator)
// Biometric ไม่เกี่ยวข้องในชั้นนี้เลย (เป็น Gate ในเครื่องผู้ใช้ก่อน Authenticator ยอมเซ็น)
// ==========================================================================

const cfg = resolveRpConfig({ NEXTAUTH_URL: "http://localhost:3000" } as NodeJS.ProcessEnv);
const subtle = webcrypto.subtle;

const b64u = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as Uint8Array).toString("base64url");
const utf8 = (s: string) => new TextEncoder().encode(s);
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest("SHA-256", data as BufferSource));
}

// --- minimal CBOR encoder (ครอบคลุมแค่ที่ Attestation Object "none" + COSE EC2 Key ต้องใช้) ---
function cborEncode(v: unknown): Uint8Array {
  const out: number[] = [];
  const hdr = (major: number, n: number) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else out.push((major << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  };
  const enc = (x: unknown) => {
    if (typeof x === "number") {
      if (x >= 0) hdr(0, x);
      else hdr(1, -1 - x);
    } else if (typeof x === "string") {
      const b = utf8(x);
      hdr(3, b.length);
      out.push(...b);
    } else if (x instanceof Uint8Array) {
      hdr(2, x.length);
      out.push(...x);
    } else if (x instanceof Map) {
      hdr(5, x.size);
      for (const [k, val] of x) {
        enc(k);
        enc(val);
      }
    } else if (x && typeof x === "object") {
      const entries = Object.entries(x as Record<string, unknown>);
      hdr(5, entries.length);
      for (const [k, val] of entries) {
        enc(k);
        enc(val);
      }
    } else throw new Error("unsupported cbor value");
  };
  enc(v);
  return new Uint8Array(out);
}

type SoftAuthenticator = {
  credentialId: Uint8Array;
  keyPair: CryptoKeyPair;
  counter: number;
  rpIdHash: Uint8Array;
  aaguid: Uint8Array;
};

async function createAuthenticator(rpID: string): Promise<SoftAuthenticator> {
  const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    credentialId: webcrypto.getRandomValues(new Uint8Array(32)),
    keyPair,
    counter: 0,
    rpIdHash: await sha256(utf8(rpID)),
    aaguid: new Uint8Array(16),
  };
}

async function cosePublicKey(auth: SoftAuthenticator): Promise<Uint8Array> {
  const jwk = await subtle.exportKey("jwk", auth.keyPair.publicKey);
  const x = Buffer.from(jwk.x!, "base64url");
  const y = Buffer.from(jwk.y!, "base64url");
  // COSE_Key EC2: {1: kty(2), 3: alg(-7 ES256), -1: crv(1 P-256), -2: x, -3: y}
  const m = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(x)], [-3, new Uint8Array(y)]]);
  return cborEncode(m);
}

function flags({ up = true, uv = true, at = false }: { up?: boolean; uv?: boolean; at?: boolean }) {
  return (up ? 0x01 : 0) | (uv ? 0x04 : 0) | (at ? 0x40 : 0);
}

function u32be(n: number) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

async function buildRegistration(auth: SoftAuthenticator, challenge: string, origin: string): Promise<RegistrationResponseJSON> {
  const clientData = utf8(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
  const cose = await cosePublicKey(auth);
  const attestedCredData = new Uint8Array([
    ...auth.aaguid,
    ...new Uint8Array([0, auth.credentialId.length]),
    ...auth.credentialId,
    ...cose,
  ]);
  const authData = new Uint8Array([...auth.rpIdHash, flags({ at: true }), ...u32be(auth.counter), ...attestedCredData]);
  const attestationObject = cborEncode({ fmt: "none", attStmt: {}, authData });
  const id = b64u(auth.credentialId);
  return {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64u(clientData),
      attestationObject: b64u(attestationObject),
      transports: ["internal"],
    },
  };
}

/** ถอด DER ECDSA signature ต้องใช้ ASN.1 — WebCrypto ให้ r||s ดิบ เราแปลงเป็น DER เองตาม Spec */
function rawToDer(sig: Uint8Array): Uint8Array {
  const half = sig.length / 2;
  const toInt = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = new Uint8Array([0, ...v]);
    return v;
  };
  const r = toInt(sig.slice(0, half));
  const s = toInt(sig.slice(half));
  const seq = new Uint8Array([0x02, r.length, ...r, 0x02, s.length, ...s]);
  return new Uint8Array([0x30, seq.length, ...seq]);
}

async function buildAssertion(
  auth: SoftAuthenticator,
  challenge: string,
  origin: string,
  userHandle: string,
  opts: { counter?: number; uv?: boolean; signer?: CryptoKey } = {}
): Promise<AuthenticationResponseJSON> {
  const clientData = utf8(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
  const counter = opts.counter ?? ++auth.counter;
  const authData = new Uint8Array([...auth.rpIdHash, flags({ uv: opts.uv ?? true }), ...u32be(counter)]);
  const toSign = new Uint8Array([...authData, ...(await sha256(clientData))]);
  const raw = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, opts.signer ?? auth.keyPair.privateKey, toSign as BufferSource));
  const id = b64u(auth.credentialId);
  return {
    id,
    rawId: id,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: b64u(clientData),
      authenticatorData: b64u(authData),
      signature: b64u(rawToDer(raw)),
      userHandle: b64u(utf8(userHandle)),
    },
  };
}

describe("WebAuthn protocol round-trip through the server verifier with our RP config", () => {
  let auth: SoftAuthenticator;
  let stored: { id: string; publicKey: Uint8Array<ArrayBuffer>; counter: number };
  const USER_ID = "user_cuid_123";

  beforeAll(async () => {
    auth = await createAuthenticator(cfg.rpID);
  });

  it("registers a credential: challenge/origin/rpID/public key all verified server-side", async () => {
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpID,
      userName: "usera",
      userID: utf8(USER_ID),
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const response = await buildRegistration(auth, options.challenge, cfg.origin);
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
    });
    expect(v.verified).toBe(true);
    expect(v.registrationInfo?.credential.id).toBe(b64u(auth.credentialId));
    stored = { id: v.registrationInfo!.credential.id, publicKey: new Uint8Array(v.registrationInfo!.credential.publicKey), counter: v.registrationInfo!.credential.counter };
  });

  it("rejects registration whose clientData challenge does not match the server-issued one", async () => {
    const options = await generateRegistrationOptions({ rpName: cfg.rpName, rpID: cfg.rpID, userName: "usera", userID: utf8(USER_ID), attestationType: "none" });
    const response = await buildRegistration(auth, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", cfg.origin);
    await expect(
      verifyRegistrationResponse({ response, expectedChallenge: options.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID })
    ).rejects.toThrow(/challenge/i);
  });

  it("rejects registration from a different origin (phishing site)", async () => {
    const options = await generateRegistrationOptions({ rpName: cfg.rpName, rpID: cfg.rpID, userName: "usera", userID: utf8(USER_ID), attestationType: "none" });
    const response = await buildRegistration(auth, options.challenge, "http://evil.example");
    await expect(
      verifyRegistrationResponse({ response, expectedChallenge: options.challenge, expectedOrigin: cfg.origin, expectedRPID: cfg.rpID })
    ).rejects.toThrow(/origin/i);
  });

  it("authenticates with a valid assertion and advances the counter", async () => {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpID, userVerification: "required", allowCredentials: [] });
    const response = await buildAssertion(auth, options.challenge, cfg.origin, USER_ID);
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
      credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
    });
    expect(v.verified).toBe(true);
    expect(v.authenticationInfo.newCounter).toBeGreaterThan(stored.counter);
    expect(Buffer.from(response.response.userHandle!, "base64url").toString()).toBe(USER_ID);
    stored.counter = v.authenticationInfo.newCounter;
  });

  it("rejects an assertion signed by a different key (credential substitution)", async () => {
    const other = await createAuthenticator(cfg.rpID);
    const options = await generateAuthenticationOptions({ rpID: cfg.rpID, allowCredentials: [] });
    const response = await buildAssertion(auth, options.challenge, cfg.origin, USER_ID, { signer: other.keyPair.privateKey });
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: options.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
    });
    expect(v.verified).toBe(false);
  });

  it("rejects a replayed assertion (challenge from an earlier ceremony)", async () => {
    const oldOptions = await generateAuthenticationOptions({ rpID: cfg.rpID, allowCredentials: [] });
    const replayed = await buildAssertion(auth, oldOptions.challenge, cfg.origin, USER_ID);
    const newOptions = await generateAuthenticationOptions({ rpID: cfg.rpID, allowCredentials: [] });
    await expect(
      verifyAuthenticationResponse({
        response: replayed,
        expectedChallenge: newOptions.challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpID,
        credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
      })
    ).rejects.toThrow(/challenge/i);
  });

  it("rejects a cloned authenticator (signCount goes backwards)", async () => {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpID, allowCredentials: [] });
    const response = await buildAssertion(auth, options.challenge, cfg.origin, USER_ID, { counter: 1 }); // stored.counter is already >= 2
    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: options.challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpID,
        credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
      })
    ).rejects.toThrow(/counter/i);
  });

  it("rejects an assertion without user verification when UV is required (no biometric/PIN gate)", async () => {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpID, userVerification: "required", allowCredentials: [] });
    const response = await buildAssertion(auth, options.challenge, cfg.origin, USER_ID, { uv: false });
    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: options.challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpID,
        requireUserVerification: true,
        credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
      })
    ).rejects.toThrow(/verif/i);
  });

  it("rejects an assertion for a different RP ID (wrong site hash)", async () => {
    const foreign = await createAuthenticator("evil.example");
    foreign.keyPair = auth.keyPair; // same key, wrong rpIdHash
    foreign.credentialId = auth.credentialId;
    const options = await generateAuthenticationOptions({ rpID: cfg.rpID, allowCredentials: [] });
    const response = await buildAssertion(foreign, options.challenge, cfg.origin, USER_ID, { counter: stored.counter + 1 });
    await expect(
      verifyAuthenticationResponse({
        response,
        expectedChallenge: options.challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpID,
        credential: { id: stored.id, publicKey: stored.publicKey, counter: stored.counter },
      })
    ).rejects.toThrow(/RP ID/i);
  });
});
