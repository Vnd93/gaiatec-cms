const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function assertFixture(fixture) {
  if (!UUID.test(fixture?.itemId ?? "") || !UUID.test(fixture?.revisionId ?? ""))
    throw new Error("G7_SCHEDULED_PUBLICATION_FIXTURE_REFUSED");
}

export function validateScheduledPublicationSnapshot(fixture, snapshot) {
  assertFixture(fixture);
  const violations = [];
  if (!["items", "publications", "projections", "audit"].every((key) => Array.isArray(snapshot?.[key])))
    return { valid: false, violations: ["snapshot_shape"] };
  const item = snapshot.items[0];
  if (
    snapshot.items.length !== 1 ||
    item.id !== fixture.itemId ||
    item.workflow_status !== "published" ||
    item.scheduled_for !== null
  )
    violations.push("item_not_published");
  for (const key of ["publications", "projections"]) {
    if (
      snapshot[key].length !== 1 ||
      snapshot[key][0].item_id !== fixture.itemId ||
      snapshot[key][0].revision_id !== fixture.revisionId
    )
      violations.push(`${key}_revision_mismatch`);
  }
  if (
    snapshot.audit.length !== 1 ||
    snapshot.audit[0].target_id !== fixture.itemId ||
    snapshot.audit[0].action !== "cms:content.publish" ||
    snapshot.audit[0].event_data?.scheduled !== true ||
    snapshot.audit[0].event_data?.revisionId !== fixture.revisionId
  )
    violations.push("scheduled_audit_mismatch");
  return { valid: violations.length === 0, violations };
}

export async function readScheduledPublicationSnapshot(admin, fixture, remainingMs) {
  assertFixture(fixture);
  const signal = AbortSignal.timeout(Math.max(1, Math.floor(remainingMs)));
  const definitions = [
    ["items", "cms_content_items", "id,workflow_status,scheduled_for", "id"],
    ["publications", "cms_publications", "item_id,revision_id", "item_id"],
    ["projections", "cms_published_projection", "item_id,revision_id", "item_id"],
    ["audit", "cms_audit_log", "target_id,action,event_data", "target_id"],
  ];
  return Object.fromEntries(
    await Promise.all(
      definitions.map(async ([key, table, columns, idKey]) => {
        let query = admin.from(table).select(columns).eq(idKey, fixture.itemId);
        if (key === "audit") query = query.eq("action", "cms:content.publish");
        const result = await query.abortSignal(signal);
        if (result.error || !Array.isArray(result.data))
          throw new Error(`G7_SCHEDULED_PUBLICATION_READ_FAILED:${key}`);
        return [key, result.data];
      }),
    ),
  );
}

// The real scheduler invokes the same due-publication RPC. Observe its exact
// result instead of racing it with a second publication after a fixed sleep.
// Keep the former 7.5-second wait budget; reads and backoff share that deadline.
export async function awaitScheduledPublicationEvidence(
  fixture,
  readSnapshot,
  { now = () => performance.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  assertFixture(fixture);
  const deadline = now() + 7_500;
  let intervalMs = 100;
  let violations = ["not_observed"];
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    const result = validateScheduledPublicationSnapshot(fixture, await readSnapshot(remainingMs));
    violations = result.violations;
    if (now() >= deadline) break;
    if (result.valid) return { verifiedScheduledPublications: 1, observations: attempt };
    const delayMs = Math.min(intervalMs, deadline - now());
    if (delayMs <= 0 || attempt === 16) break;
    await sleep(delayMs);
    intervalMs = Math.min(intervalMs * 2, 1_000);
  }
  throw new Error(`G7_SCHEDULED_PUBLICATION_STATE_REFUSED:${violations.join(",") || "deadline"}`);
}
