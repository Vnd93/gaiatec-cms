import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  corsResponseOrigin,
  exactAllowlist,
  isExactHostnameAllowed,
  isExactOriginAllowed,
  isTurnstileVerificationAccepted,
  TURNSTILE_STAGING_ALWAYS_PASS_SECRET,
} from "../../supabase/functions/_shared/exact-origin-allowlist";

interface StagingEdgePublicSecretsModule {
  STAGING_EDGE_PUBLIC_HOSTNAMES: readonly string[];
  STAGING_EDGE_PUBLIC_ORIGINS: readonly string[];
  STAGING_EDGE_PUBLIC_SECRET_NAMES: readonly string[];
  expectedStagingEdgePublicSecrets(candidateSha: string): Readonly<Record<string, string>>;
}

const {
  STAGING_EDGE_PUBLIC_HOSTNAMES,
  STAGING_EDGE_PUBLIC_ORIGINS,
  STAGING_EDGE_PUBLIC_SECRET_NAMES,
  expectedStagingEdgePublicSecrets,
} = await vi.importActual<StagingEdgePublicSecretsModule>(
  "../../scripts/ev2/phase12/staging-edge-public-secrets-lib.mjs",
);

const allowedOrigins = [
  "https://gaiatec-cms-staging.pages.dev",
  "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g16-csp-canary.gaiatec-cms-staging.pages.dev",
  "https://ev2-g12-rollback-compat.gaiatec-cms-staging.pages.dev",
];
const allowedHostnames = allowedOrigins.map((origin) => new URL(origin).hostname);
const configuredOrigins = allowedOrigins.join(",");
const configuredHostnames = allowedHostnames.join(",");
const productionOrigins = ["https://gaiatecsistemas.com.br", "https://www.gaiatecsistemas.com.br"];
const productionHostnames = ["gaiatecsistemas.com.br", "www.gaiatecsistemas.com.br"];

describe("exact Edge Function origin allowlist", () => {
  it("allows only the declared staging aliases and never an arbitrary Pages branch", () => {
    expect(exactAllowlist(configuredOrigins).size).toBe(5);
    for (const origin of allowedOrigins) {
      expect(isExactOriginAllowed(origin, configuredOrigins)).toBe(true);
    }

    const arbitrary = "https://attacker.gaiatec-cms-staging.pages.dev";
    expect(isExactOriginAllowed(arbitrary, configuredOrigins)).toBe(false);
    expect(
      isExactOriginAllowed(
        "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev.attacker.example",
        configuredOrigins,
      ),
    ).toBe(false);
    expect(corsResponseOrigin(arbitrary, configuredOrigins)).toBe("https://gaiatecsistemas.com.br");
    expect(exactAllowlist("*").size).toBe(0);
    expect(isExactOriginAllowed(allowedOrigins[0], "*")).toBe(false);
  });

  it("uses the same exact-match policy for Turnstile hostnames", () => {
    expect(exactAllowlist(configuredHostnames).size).toBe(5);
    for (const hostname of allowedHostnames)
      expect(isExactHostnameAllowed(hostname, configuredHostnames, undefined)).toBe(true);
    expect(
      isExactHostnameAllowed("attacker.gaiatec-cms-staging.pages.dev", configuredHostnames, undefined),
    ).toBe(false);
    expect(
      isExactHostnameAllowed(
        "ev2-g17-canary.gaiatec-cms-staging.pages.dev.attacker.example",
        configuredHostnames,
        undefined,
      ),
    ).toBe(false);
    expect(isExactHostnameAllowed(allowedHostnames[0], "*", configuredOrigins)).toBe(false);
  });

  it("permits the official always-pass response only in staging and keeps production strict", () => {
    const expectedCdata = "65ce5231-ee71-41ba-aaf8-b8c77f4cd42d";
    const dummyResult = {
      success: true,
      hostname: "example.com",
      action: undefined,
      cdata: expectedCdata,
    };
    const stagingPolicy = {
      secret: TURNSTILE_STAGING_ALWAYS_PASS_SECRET,
      environment: "staging",
      expectedAction: "lead_capture",
      expectedCdata,
      configuredHostnames,
      configuredOrigins,
    };
    expect(isTurnstileVerificationAccepted(dummyResult, stagingPolicy)).toBe(true);
    expect(isTurnstileVerificationAccepted({ ...dummyResult, cdata: undefined }, stagingPolicy)).toBe(false);
    expect(
      isTurnstileVerificationAccepted(
        { ...dummyResult, cdata: "9cc939db-d4a1-4e56-b69b-b897d30f1e9c" },
        stagingPolicy,
      ),
    ).toBe(false);
    expect(
      isTurnstileVerificationAccepted(dummyResult, { ...stagingPolicy, environment: "production" }),
    ).toBe(false);
    expect(
      isTurnstileVerificationAccepted(
        { success: false, hostname: allowedHostnames[0], action: "lead_capture", cdata: expectedCdata },
        stagingPolicy,
      ),
    ).toBe(false);

    const productionPolicy = {
      ...stagingPolicy,
      secret: "a-real-production-secret",
      environment: "production",
      configuredHostnames: productionHostnames.join(","),
      configuredOrigins: productionOrigins.join(","),
    };
    expect(
      isTurnstileVerificationAccepted(
        {
          success: true,
          hostname: productionHostnames[0],
          action: "lead_capture",
          cdata: expectedCdata,
        },
        productionPolicy,
      ),
    ).toBe(true);
    expect(
      isTurnstileVerificationAccepted(
        { success: true, hostname: "attacker.example", action: "lead_capture", cdata: expectedCdata },
        productionPolicy,
      ),
    ).toBe(false);
    expect(
      isTurnstileVerificationAccepted(
        { success: true, hostname: productionHostnames[0], action: "other", cdata: expectedCdata },
        productionPolicy,
      ),
    ).toBe(false);
    expect(
      isTurnstileVerificationAccepted(
        {
          success: true,
          hostname: productionHostnames[0],
          action: "lead_capture",
          cdata: "9cc939db-d4a1-4e56-b69b-b897d30f1e9c",
        },
        productionPolicy,
      ),
    ).toBe(false);
    expect(
      isTurnstileVerificationAccepted(
        { success: true, hostname: productionHostnames[0], action: "lead_capture" },
        productionPolicy,
      ),
    ).toBe(false);
  });

  it("documents every final canary alias without a wildcard", () => {
    const example = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    for (const origin of allowedOrigins) expect(example).toContain(origin);
    for (const hostname of allowedHostnames) expect(example).toContain(hostname);
    expect(example.match(/^ALLOWED_ORIGINS=(.+)$/m)?.[1]).not.toContain("*");
    expect(example.match(/^TURNSTILE_ALLOWED_HOSTNAMES=(.+)$/m)?.[1]).not.toContain("*");
    const documentedStagingOrigins = example.match(/^# Staging: ALLOWED_ORIGINS=(.+)$/m)?.[1].split(",");
    const documentedStagingHostnames = example
      .match(/^# Staging: TURNSTILE_ALLOWED_HOSTNAMES=(.+)$/m)?.[1]
      .split(",");
    expect(documentedStagingOrigins).toHaveLength(allowedOrigins.length);
    expect(new Set(documentedStagingOrigins)).toEqual(new Set(allowedOrigins));
    expect(documentedStagingHostnames).toHaveLength(allowedHostnames.length);
    expect(new Set(documentedStagingHostnames)).toEqual(new Set(allowedHostnames));
  });

  it("keeps the canonical staging Edge public config exact, complete and free of extra Pages branches", () => {
    const candidateSha = "a".repeat(40);
    const configuration = expectedStagingEdgePublicSecrets(candidateSha);
    const configuredPublicOrigins = configuration.ALLOWED_ORIGINS.split(",");
    const configuredPublicHostnames = configuration.TURNSTILE_ALLOWED_HOSTNAMES.split(",");

    expect(STAGING_EDGE_PUBLIC_ORIGINS).toEqual(allowedOrigins);
    expect(STAGING_EDGE_PUBLIC_HOSTNAMES).toEqual(allowedHostnames);
    expect(configuredPublicOrigins).toHaveLength(allowedOrigins.length);
    expect(new Set(configuredPublicOrigins)).toEqual(new Set(allowedOrigins));
    expect(configuredPublicHostnames).toHaveLength(allowedHostnames.length);
    expect(new Set(configuredPublicHostnames)).toEqual(new Set(allowedHostnames));
    expect(configuredPublicOrigins.some((origin) => origin.includes("*"))).toBe(false);
    expect(configuredPublicHostnames.some((hostname) => hostname.includes("*"))).toBe(false);
    expect(configuration.CMS_ENVIRONMENT).toBe("staging");
    expect(configuration.CMS_RELEASE_SHA).toBe(candidateSha);
    expect(configuration.CONTACT_CAPTCHA_ALWAYS).toBe("true");
    expect(Object.keys(configuration).sort()).toEqual([...STAGING_EDGE_PUBLIC_SECRET_NAMES].sort());
  });

  it("keeps every production workflow allowlist isolated from staging", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy-production.yml"), "utf8");
    const originSets = [...workflow.matchAll(/^\s+ALLOWED_ORIGINS:\s+(.+)$/gm)].map((match) =>
      match[1].split(","),
    );
    const hostnameSets = [...workflow.matchAll(/^\s+TURNSTILE_ALLOWED_HOSTNAMES:\s+(.+)$/gm)].map((match) =>
      match[1].split(","),
    );

    expect(originSets.length).toBeGreaterThan(0);
    expect(hostnameSets.length).toBe(originSets.length);
    for (const origins of originSets) {
      expect(origins).toHaveLength(productionOrigins.length);
      expect(new Set(origins)).toEqual(new Set(productionOrigins));
      expect(origins.some((origin) => origin.includes("pages.dev") || origin.includes("*"))).toBe(false);
    }
    for (const hostnames of hostnameSets) {
      expect(hostnames).toHaveLength(productionHostnames.length);
      expect(new Set(hostnames)).toEqual(new Set(productionHostnames));
      expect(hostnames.some((hostname) => hostname.includes("pages.dev") || hostname.includes("*"))).toBe(
        false,
      );
    }
  });

  it("wires all shared CORS consumers to the tested exact policy", () => {
    const security = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/security.ts"), "utf8");
    expect(security).toContain("isExactOriginAllowed");
    expect(security).toContain("isExactHostnameAllowed");
    expect(security).toContain("corsResponseOrigin");
    expect(security).not.toContain("endsWith");
  });
});
