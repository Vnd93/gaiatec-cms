import { afterEach, describe, expect, it, vi } from "vitest";
import { isEv2FeatureEnabled } from "@/admin/ev2-runtime";
import {
  Ev2FeatureFlagKeySchema,
  type Ev2CapabilityManifest,
  type Ev2Environment,
  type Ev2FeatureFlagKey,
} from "@/shared/contracts/ev2-foundation";

function manifest(
  enabled: Ev2FeatureFlagKey[] = [],
  {
    environment = "local",
    status = "ready",
    evaluatedAt = new Date().toISOString(),
    source = "override",
  }: {
    environment?: Ev2Environment;
    status?: Ev2CapabilityManifest["status"];
    evaluatedAt?: string;
    source?: "default" | "override" | "kill_switch" | "unavailable";
  } = {},
): Ev2CapabilityManifest {
  return {
    schemaVersion: 1,
    status,
    environment,
    siteKey: "main",
    evaluatedAt,
    capabilities: Object.fromEntries(
      Ev2FeatureFlagKeySchema.options.map((key) => [
        key,
        {
          schemaVersion: 1,
          key,
          enabled: enabled.includes(key),
          source: enabled.includes(key) ? source : "unavailable",
          evaluatedAt,
        },
      ]),
    ) as Ev2CapabilityManifest["capabilities"],
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("EV2 runtime eligibility", () => {
  it("enables only a fresh individual override for the exact environment", () => {
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "local");
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifest(["ev2.dam"]) }, "ev2.dam")).toBe(true);
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifest(["ev2.dam"]) }, "ev2.pim_v2")).toBe(false);
  });

  it("fails closed for absent, stale, broad/default or mismatched manifests", () => {
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "staging");
    const now = Date.now();
    expect(isEv2FeatureEnabled(null, "ev2.dam", now)).toBe(false);
    expect(
      isEv2FeatureEnabled(
        { ev2Capabilities: manifest(["ev2.dam"], { environment: "staging", status: "unavailable" }) },
        "ev2.dam",
        now,
      ),
    ).toBe(false);
    expect(
      isEv2FeatureEnabled(
        {
          ev2Capabilities: manifest(["ev2.dam"], {
            environment: "staging",
            evaluatedAt: new Date(now - 76_000).toISOString(),
          }),
        },
        "ev2.dam",
        now,
      ),
    ).toBe(false);
    expect(
      isEv2FeatureEnabled(
        { ev2Capabilities: manifest(["ev2.dam"], { environment: "staging", source: "default" }) },
        "ev2.dam",
        now,
      ),
    ).toBe(false);
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifest(["ev2.dam"]) }, "ev2.dam", now)).toBe(false);
  });

  it("tolerates bounded server-ahead clock skew and rejects an implausible future manifest", () => {
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "staging");
    const now = Date.now();
    expect(
      isEv2FeatureEnabled(
        {
          ev2Capabilities: manifest(["ev2.dam"], {
            environment: "staging",
            evaluatedAt: new Date(now + 60_000).toISOString(),
          }),
        },
        "ev2.dam",
        now,
      ),
    ).toBe(true);
    expect(
      isEv2FeatureEnabled(
        {
          ev2Capabilities: manifest(["ev2.dam"], {
            environment: "staging",
            evaluatedAt: new Date(now + 121_000).toISOString(),
          }),
        },
        "ev2.dam",
        now,
      ),
    ).toBe(false);
  });

  it("ignores legacy switches and accepts only an individual production override manifest", () => {
    vi.stubEnv("VITE_EV2_DAM_CANDIDATE", "true");
    expect(isEv2FeatureEnabled(undefined, "ev2.dam")).toBe(false);
    vi.stubEnv("VITE_CMS_ENVIRONMENT", "production");
    expect(
      isEv2FeatureEnabled(
        { ev2Capabilities: manifest(["ev2.dam"], { environment: "production" }) },
        "ev2.dam",
      ),
    ).toBe(true);
    expect(
      isEv2FeatureEnabled(
        {
          ev2Capabilities: manifest(["ev2.dam"], {
            environment: "production",
            source: "default",
          }),
        },
        "ev2.dam",
      ),
    ).toBe(false);
  });
});
