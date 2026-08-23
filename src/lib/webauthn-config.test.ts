import { describe, it, expect } from "vitest";
import { resolveRpConfig, isChallengeUsable, CHALLENGE_TTL_MS } from "./webauthn-config";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("resolveRpConfig — RP ID / Origin from environment (no hardcoded domain)", () => {
  it("derives rpID + origin from NEXTAUTH_URL for localhost dev", () => {
    const cfg = resolveRpConfig(env({ NEXTAUTH_URL: "http://localhost:3000" }));
    expect(cfg).toMatchObject({ rpID: "localhost", origin: "http://localhost:3000" });
  });
  it("derives rpID + origin for a production https domain", () => {
    const cfg = resolveRpConfig(env({ NEXTAUTH_URL: "https://billing.example.co.th" }));
    expect(cfg).toMatchObject({ rpID: "billing.example.co.th", origin: "https://billing.example.co.th" });
  });
  it("allows an explicit parent-domain RP ID that the origin belongs to", () => {
    const cfg = resolveRpConfig(env({ NEXTAUTH_URL: "https://billing.example.co.th", WEBAUTHN_RP_ID: "example.co.th" }));
    expect(cfg.rpID).toBe("example.co.th");
  });
  it("rejects an RP ID that the origin is NOT a member of (misconfiguration fails loudly)", () => {
    expect(() => resolveRpConfig(env({ NEXTAUTH_URL: "https://billing.example.co.th", WEBAUTHN_RP_ID: "evil.com" }))).toThrow(/not a registrable suffix/);
  });
  it("fails loudly without NEXTAUTH_URL", () => {
    expect(() => resolveRpConfig(env({}))).toThrow(/NEXTAUTH_URL/);
  });
});

describe("isChallengeUsable — expiry / type / user binding", () => {
  const now = new Date("2026-08-23T12:00:00Z");
  const fresh = new Date(now.getTime() + CHALLENGE_TTL_MS - 1000);
  it("accepts a fresh registration challenge issued to the same user", () => {
    expect(isChallengeUsable({ expiresAt: fresh, type: "registration", userId: "u1" }, { type: "registration", userId: "u1" }, now)).toBe(true);
  });
  it("rejects an expired challenge", () => {
    expect(isChallengeUsable({ expiresAt: new Date(now.getTime() - 1), type: "registration", userId: "u1" }, { type: "registration", userId: "u1" }, now)).toBe(false);
  });
  it("rejects a registration challenge used by a different user (cross-user misuse)", () => {
    expect(isChallengeUsable({ expiresAt: fresh, type: "registration", userId: "u1" }, { type: "registration", userId: "u2" }, now)).toBe(false);
  });
  it("rejects type substitution (registration challenge presented as authentication)", () => {
    expect(isChallengeUsable({ expiresAt: fresh, type: "registration", userId: null }, { type: "authentication", userId: null }, now)).toBe(false);
  });
  it("accepts an authentication challenge (no user bound yet)", () => {
    expect(isChallengeUsable({ expiresAt: fresh, type: "authentication", userId: null }, { type: "authentication", userId: null }, now)).toBe(true);
  });
});
