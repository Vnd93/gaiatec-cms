const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EXPIRY_STATUSES = { redirect: 301, "not-found": 404, gone: 410, fallback: 302 };

function assertFixtures(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length !== 4)
    throw new Error("G7_CAMPAIGN_EXPIRY_FIXTURES_REFUSED");
  const modes = new Set();
  const ids = new Set();
  const revisions = new Set();
  const tags = new Set();
  for (const fixture of fixtures) {
    const match = /^expira-(redirect|not-found|gone|fallback)-(qacmsfinal\d{8}[a-f0-9]{8})$/.exec(
      fixture?.slug ?? "",
    );
    if (
      !match ||
      !UUID.test(fixture.itemId) ||
      !UUID.test(fixture.revisionId) ||
      fixture.expectedStatus !== EXPIRY_STATUSES[match[1]] ||
      ([301, 302].includes(fixture.expectedStatus)
        ? typeof fixture.destination !== "string" || !/^\/(?!\/)[a-z0-9/_-]+$/.test(fixture.destination)
        : fixture.destination !== null)
    )
      throw new Error("G7_CAMPAIGN_EXPIRY_FIXTURES_REFUSED");
    modes.add(match[1]);
    ids.add(fixture.itemId);
    revisions.add(fixture.revisionId);
    tags.add(match[2]);
  }
  if (modes.size !== 4 || ids.size !== 4 || revisions.size !== 4 || tags.size !== 1)
    throw new Error("G7_CAMPAIGN_EXPIRY_FIXTURES_REFUSED");
}

export function validateCampaignExpirySnapshot(fixtures, snapshot) {
  assertFixtures(fixtures);
  const violations = [];
  const keys = ["items", "publications", "projections", "routes", "outbox"];
  if (keys.some((key) => !Array.isArray(snapshot?.[key])))
    return { valid: false, violations: ["snapshot_shape"] };
  const expectedIds = new Set(fixtures.map((fixture) => fixture.itemId));
  for (const key of keys) {
    const idKey = key === "items" ? "id" : "item_id";
    if (snapshot[key].some((row) => !row || !expectedIds.has(row[idKey])))
      violations.push(`${key}_foreign_item`);
  }
  if (snapshot.publications.length) violations.push("publication_still_live");
  if (snapshot.projections.length) violations.push("projection_still_live");
  for (const fixture of fixtures) {
    const items = snapshot.items.filter((row) => row?.id === fixture.itemId);
    if (
      items.length !== 1 ||
      items[0].workflow_status !== "archived" ||
      typeof items[0].archived_at !== "string" ||
      !Number.isFinite(Date.parse(items[0].archived_at))
    )
      violations.push("item_not_archived");
    const routes = snapshot.routes.filter((row) => row?.item_id === fixture.itemId);
    if (
      routes.length !== 1 ||
      routes[0].source_path !== `/campanhas/${fixture.slug}` ||
      routes[0].active !== true ||
      routes[0].status_code !== fixture.expectedStatus ||
      routes[0].destination_path !== fixture.destination
    )
      violations.push("expiry_route_mismatch");
    const receipts = snapshot.outbox.filter((row) => row?.item_id === fixture.itemId);
    if (
      receipts.length !== 1 ||
      receipts[0].revision_id !== fixture.revisionId ||
      receipts[0].event_type !== "unpublish"
    )
      violations.push("unpublish_receipt_mismatch");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export async function readCampaignExpirySnapshot(admin, fixtures, remainingMs) {
  assertFixtures(fixtures);
  const ids = fixtures.map((fixture) => fixture.itemId);
  const signal = AbortSignal.timeout(Math.max(1, Math.floor(remainingMs)));
  const definitions = [
    ["items", "cms_content_items", "id,workflow_status,archived_at", "id"],
    ["publications", "cms_publications", "item_id", "item_id"],
    ["projections", "cms_published_projection", "item_id", "item_id"],
    ["routes", "cms_route_rules", "item_id,source_path,status_code,destination_path,active", "item_id"],
    ["outbox", "cms_publication_outbox", "item_id,revision_id,event_type", "item_id"],
  ];
  return Object.fromEntries(
    await Promise.all(
      definitions.map(async ([key, table, columns, idKey]) => {
        let query = admin.from(table).select(columns).in(idKey, ids);
        if (key === "outbox") query = query.eq("event_type", "unpublish");
        const result = await query.abortSignal(signal);
        if (result.error || !Array.isArray(result.data))
          throw new Error(`G7_CAMPAIGN_EXPIRY_READ_FAILED:${key}`);
        return [key, result.data];
      }),
    ),
  );
}

// SKIP LOCKED lets the scheduled worker own rows before the explicit RPC.
// Poll only these four fixtures; never repeat a mutation or stop the worker.
export async function awaitCampaignExpiryEvidence(
  fixtures,
  readSnapshot,
  { now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  assertFixtures(fixtures);
  const startedAt = now();
  const deadline = startedAt + 10_000;
  let intervalMs = 100;
  let violations = ["not_observed"];
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    const result = validateCampaignExpirySnapshot(fixtures, await readSnapshot(remainingMs));
    violations = result.violations;
    if (now() >= deadline) break;
    if (result.valid) return { verifiedCampaigns: 4, observations: attempt };
    const delayMs = Math.min(intervalMs, deadline - now());
    if (delayMs <= 0 || attempt === 16) break;
    await sleep(delayMs);
    intervalMs = Math.min(intervalMs * 2, 1_000);
  }
  throw new Error(`G7_CAMPAIGN_EXPIRY_STATE_REFUSED:${violations.join(",") || "deadline"}`);
}
