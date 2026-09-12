import { EV2_DELIVERABLE_FEATURES } from "@/shared/contracts/ev2-foundation";
import type {
  Ev2CapabilityManifest,
  Ev2Environment,
  Ev2FeatureFlagKey,
} from "@/shared/contracts/ev2-foundation";

const MAX_MANIFEST_AGE_MS = 60_000;
// Browser and API clocks can legitimately differ. Accept a small amount of
// server-ahead skew while continuing to reject stale or implausibly future manifests.
const MAX_SERVER_CLOCK_AHEAD_MS = 120_000;

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
  if (manifest?.status !== "ready" || manifest.environment !== environment || manifest.siteKey !== "main")
    return false;
  const evaluatedAt = Date.parse(manifest.evaluatedAt);
  if (
    !Number.isFinite(evaluatedAt) ||
    evaluatedAt > now + MAX_SERVER_CLOCK_AHEAD_MS ||
    now - evaluatedAt > MAX_MANIFEST_AGE_MS
  )
    return false;
  const capability = manifest.capabilities[feature];
  if (capability?.key !== feature || capability.enabled !== true) return false;
  if (capability.source === "override") return true;
  // "default" com enabled=true só existe quando a funcionalidade foi declarada entregue no livro
  // de entregas (migration 0093): a coluna default_enabled tem check (default_enabled is false)
  // desde a 0037, então este par era impossível antes dela.
  //
  // Aceito apenas para as entregáveis. Para as outras dez o par continua sendo recusado aqui, e
  // essa recusa é o que mantém de pé a garantia anterior — cada uma delas é o portão único de algo
  // que a revisão de segurança mandou manter fechado, ou um adiamento declarado.
  return capability.source === "default" && (EV2_DELIVERABLE_FEATURES as readonly string[]).includes(feature);
}
