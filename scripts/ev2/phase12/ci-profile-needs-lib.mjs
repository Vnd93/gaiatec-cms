const JOBS = Object.freeze([
  "release-plan",
  "quality",
  "package-staging",
  "hotfix-bundle-smoke",
  "database",
  "browser",
]);

export const CI_PROFILE_NEEDS = Object.freeze({
  "frontend-only": Object.freeze({
    "release-plan": "success",
    quality: "success",
    "package-staging": "success",
    "hotfix-bundle-smoke": "skipped",
    database: "skipped",
    browser: "success",
  }),
  "edge-only": Object.freeze({
    "release-plan": "success",
    quality: "success",
    "package-staging": "success",
    "hotfix-bundle-smoke": "success",
    database: "skipped",
    browser: "success",
  }),
  "database-auth": Object.freeze({
    "release-plan": "success",
    quality: "success",
    "package-staging": "success",
    "hotfix-bundle-smoke": "skipped",
    database: "success",
    browser: "success",
  }),
  "full-release": Object.freeze({
    "release-plan": "success",
    quality: "success",
    "package-staging": "success",
    "hotfix-bundle-smoke": "success",
    database: "success",
    browser: "success",
  }),
});

function refuse(label) {
  throw new Error(`G12_CI_PROFILE_NEEDS_REFUSED:${label}`);
}

export function verifyCiProfileNeeds({ profile, results, eventName, ref }) {
  const profileExpected = CI_PROFILE_NEEDS[profile];
  if (!profileExpected) refuse(`profile:unknown_${String(profile ?? "")}`);
  if (!/^[a-z_]+$/.test(String(eventName ?? "")) || typeof ref !== "string" || !ref) refuse("event:invalid");
  const expected = {
    ...profileExpected,
    "package-staging": eventName === "push" && ref === "refs/heads/main" ? "success" : "skipped",
  };
  if (
    !results ||
    typeof results !== "object" ||
    Array.isArray(results) ||
    JSON.stringify(Object.keys(results).sort()) !== JSON.stringify([...JOBS].sort())
  )
    refuse("results:shape");
  for (const job of JOBS) {
    const actual = results[job];
    if (actual !== expected[job]) refuse(`${job}:expected_${expected[job]}:actual_${String(actual ?? "")}`);
  }
  return {
    schemaVersion: 1,
    event: "g12.ci.profile_needs.verified",
    profile,
    results: Object.fromEntries(JOBS.map((job) => [job, results[job]])),
  };
}
