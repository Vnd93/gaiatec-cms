const environment = process.env.CMS_BACKEND_ENVIRONMENT;
const url = String(process.env.CMS_BACKEND_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.CMS_BACKEND_ANON_KEY ?? "";
const origin = process.env.CMS_BACKEND_ORIGIN ?? "";
const expectedRefs = {
  staging: "glcqsosxwgmlhzgcsnzv",
  production: "chfuhctnhqgyjowkvllv",
};
const expectedOrigins = {
  staging: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
  production: "https://gaiatecsistemas.com.br",
};
const expectedRef = expectedRefs[environment];
const expectedOrigin = expectedOrigins[environment];

if (
  !expectedRef ||
  url !== `https://${expectedRef}.supabase.co` ||
  anonKey.length < 30 ||
  origin !== expectedOrigin
)
  throw new Error("G12_BACKEND_BOUNDARY_INPUT_REFUSED");

const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, result: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}:${detail}`);
};
const request = async (functionName, { method = "POST", requestOrigin = origin, query = "", body } = {}) => {
  const response = await fetch(`${url}/functions/v1/${functionName}${query}`, {
    method,
    headers: {
      apikey: anonKey,
      Origin: requestOrigin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload, text };
};

const collection = await request("cms-public", {
  method: "GET",
  query: "?type=products&contentType=product",
});
check("public_collection_available", collection.response.status === 200, collection.response.status);
check("public_collection_contract", Array.isArray(collection.payload?.items), "items");
check(
  "public_response_has_no_secret_material",
  !/(?:service_role|sb_secret_|sk-or-|BEGIN (?:RSA )?PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY)/i.test(
    collection.text,
  ),
  "sanitized",
);

const anonymousSession = await request("cms-session", {
  body: { action: "resolve" },
});
check(
  "protected_session_rejects_anonymous",
  [401, 403].includes(anonymousSession.response.status),
  anonymousSession.response.status,
);

const anonymousDocuments = await request("cms-documents", {
  body: { action: "list", envelope: {} },
});
check(
  "protected_documents_reject_anonymous",
  [400, 401, 403].includes(anonymousDocuments.response.status),
  anonymousDocuments.response.status,
);

const deniedOrigins = [
  { id: "unrelated", value: "https://attacker.invalid" },
  {
    id: "arbitrary_pages_branch",
    value:
      environment === "staging"
        ? "https://unapproved-branch.gaiatec-cms-staging.pages.dev"
        : "https://unapproved-branch.gaiatec-website.pages.dev",
  },
  { id: "suffix_spoof", value: `${expectedOrigin}.attacker.invalid` },
];

for (const functionName of ["cms-session", "lead-capture"]) {
  for (const deniedOrigin of deniedOrigins) {
    const hostile = await request(functionName, {
      requestOrigin: deniedOrigin.value,
      body: functionName === "cms-session" ? { action: "resolve" } : {},
    });
    check(
      `${functionName}_rejects_${deniedOrigin.id}_origin`,
      functionName === "cms-session"
        ? [401, 403].includes(hostile.response.status)
        : hostile.response.status === 403,
      hostile.response.status,
    );
    check(
      `${functionName}_does_not_reflect_${deniedOrigin.id}_origin`,
      hostile.response.headers.get("access-control-allow-origin") !== deniedOrigin.value,
      hostile.response.headers.get("access-control-allow-origin") ?? "missing",
    );
  }
}

console.log(
  JSON.stringify({
    schemaVersion: 1,
    event: "g12.supabase.boundary.probe",
    environment,
    projectRef: expectedRef,
    checks: checks.length,
    outcome: "pass",
  }),
);
