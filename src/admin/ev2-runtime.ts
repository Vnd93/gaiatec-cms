import type {
  Ev2CapabilityManifest,
  Ev2Environment,
  Ev2FeatureFlagKey,
} from "@/shared/contracts/ev2-foundation";

const MAX_MANIFEST_AGE_MS = 60_000;

type CapabilityProfile = {
  ev2Capabilities?: Ev2CapabilityManifest;
} | null;

export function cmsEnvironment(): Ev2Environment {
  const configured = import.meta.env.VITE_CMS_ENVIRONMENT;
  return configured === "staging" || configured === "production" ? configured : "local";
}

export function isEv2FeatureEnabled(
  profile: CapabilityProfile | undefined,
  feature: Ev2FeatureFlagKey,
  now = Date.now(),
): boolean {
  const manifest = profile?.ev2Capabilities;
  const environment = cmsEnvironment();
  if (
    environment === "production" ||
    manifest?.status !== "ready" ||
    manifest.environment !== environment ||
    manifest.siteKey !== "main"
  )
    return false;
  const evaluatedAt = Date.parse(manifest.evaluatedAt);
  if (!Number.isFinite(evaluatedAt) || evaluatedAt > now + 5_000 || now - evaluatedAt > MAX_MANIFEST_AGE_MS)
    return false;
  const capability = manifest.capabilities[feature];
  return capability?.key === feature && capability.enabled === true && capability.source === "override";
}
