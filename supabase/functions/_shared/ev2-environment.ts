export type CmsEnvironment = "local" | "staging" | "production";

export function isConfiguredCmsEnvironment(value: string | undefined): value is CmsEnvironment {
  return value === "local" || value === "staging" || value === "production";
}

export function isProductionOperationEnabled(environment: CmsEnvironment): boolean {
  return environment !== "production" || Deno.env.get("CMS_EV2_PRODUCTION_ENABLED") === "true";
}
