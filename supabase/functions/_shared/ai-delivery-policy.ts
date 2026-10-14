import policy from "./ai-delivery-policy.json" with { type: "json" };

// Release-bound, not an environment override. Re-enabling requires a new
// reviewed candidate and provider/privacy gates; secrets cannot enable it.
export function externalAiDeliveryAllowed(): boolean {
  if (policy.schemaVersion !== 1 || policy.policyKey !== "cms-manual-only-v1" ||
    policy.mode !== "manual-only" || policy.externalProviderEnabled !== false ||
    policy.assistedExecutionEnabled !== false || policy.automaticPublishAllowed !== false)
    throw new Error("CMS_AI_DELIVERY_POLICY_INVALID");
  return false;
}

export const AI_MANUAL_DELIVERY_POLICY = "cms-manual-only-v1";
