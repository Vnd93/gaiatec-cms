throw new Error(
  [
    "LOCAL_PRODUCTION_DEPLOY_BLOCKED:",
    "use .github/workflows/deploy-production.yml with an immutable candidate SHA and its versioned approval record.",
    "A local build may load .env.local and must never be published to the production Pages project.",
  ].join(" "),
);
