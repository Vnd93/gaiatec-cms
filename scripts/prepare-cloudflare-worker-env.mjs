const PRODUCTION_SUPABASE_ORIGIN = "https://chfuhctnhqgyjowkvllv.supabase.co";

export function resolveCloudflareWorkerEnvironment(
  runtimeEnvironment,
  { cwd = process.cwd(), loadEnvironment } = {},
) {
  if (runtimeEnvironment?.VITE_CMS_ENVIRONMENT === "production") {
    // Vite's loadEnv() intentionally reads .env.local and
    // .env.production.local. A production artifact must use only the
    // explicitly injected, masked workflow environment.
    return { ...runtimeEnvironment };
  }
  if (typeof loadEnvironment !== "function") {
    throw new Error("CLOUDFLARE_WORKER_ENV_LOADER_REQUIRED");
  }
  return loadEnvironment("production", cwd, "");
}

export function resolveCloudflareWorkerBindings(environment) {
  const production = environment?.VITE_CMS_ENVIRONMENT === "production";
  const configuredUrl = environment?.VITE_SUPABASE_URL ?? "";
  const anonKey = environment?.VITE_SUPABASE_ANON_KEY ?? "";

  if (production && (!configuredUrl || anonKey.trim() !== anonKey || anonKey.length < 20)) {
    throw new Error("CLOUDFLARE_WORKER_PRODUCTION_BINDINGS_REQUIRED");
  }

  const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("CLOUDFLARE_WORKER_SUPABASE_URL_INVALID");
  }
  if (
    production &&
    (parsed.origin !== PRODUCTION_SUPABASE_ORIGIN ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password)
  ) {
    throw new Error("CLOUDFLARE_WORKER_PRODUCTION_TARGET_REFUSED");
  }

  return {
    publicApi: `${parsed.origin}/functions/v1/cms-public`,
    anonKey,
  };
}
