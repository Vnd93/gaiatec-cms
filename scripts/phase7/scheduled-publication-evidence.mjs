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
    item?.id !== fixture.itemId ||
    item.workflow_status !== "published" ||
    item.scheduled_for !== null
  )
    violations.push("item_not_published");
  for (const key of ["publications", "projections"]) {
    if (
      snapshot[key].length !== 1 ||
      snapshot[key][0]?.item_id !== fixture.itemId ||
      snapshot[key][0].revision_id !== fixture.revisionId
    )
      violations.push(`${key}_revision_mismatch`);
  }
  if (
    snapshot.audit.length !== 1 ||
    snapshot.audit[0]?.target_id !== fixture.itemId ||
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
        if (result.error || !Array.isArray(result.data)) {
          const code = /^[A-Z0-9_]{1,20}$/.test(result.error?.code ?? "") ? result.error.code : "transport";
          throw new Error(
            `G7_SCHEDULED_PUBLICATION_READ_FAILED:${key}:${signal.aborted ? "deadline" : code}`,
          );
        }
        return [key, result.data];
      }),
    ),
  );
}

// Wait for the server's due time, not for a five-minute cron to happen to run.
// The old 7.5-second waiting budget remains bounded. Publication and evidence
// requests have separate, shorter bounds than the former unbounded RPC/reads.
export async function awaitScheduledPublicationEvidence(
  fixture,
  readSnapshot,
  {
    scheduledFor,
    readServerNow,
    publishOnce,
    now = () => performance.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  assertFixture(fixture);
  const dueAt = Date.parse(scheduledFor ?? "");
  if (!Number.isFinite(dueAt) || typeof readServerNow !== "function" || typeof publishOnce !== "function")
    throw new Error("G7_SCHEDULED_PUBLICATION_DRIVER_REFUSED");
  const deadline = now() + 7_500;
  let intervalMs = 100;
  let due = false;
  for (let attempt = 1; attempt <= 16; attempt += 1) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    const serverTime = await readServerNow(remainingMs);
    if (!Number.isFinite(serverTime)) throw new Error("G7_SCHEDULED_PUBLICATION_CLOCK_REFUSED");
    if (now() >= deadline) break;
    if (serverTime >= dueAt) {
      due = true;
      break;
    }
    const delayMs = Math.min(intervalMs, deadline - now());
    if (delayMs <= 0 || attempt === 16) break;
    await sleep(delayMs);
    intervalMs = Math.min(intervalMs * 2, 1_000);
  }
  if (!due) throw new Error("G7_SCHEDULED_PUBLICATION_DUE_DEADLINE");
  // Only the exact pending fixture may enter the existing row-locked RPC.
  const pending = await readSnapshot(5_000);
  if (validateScheduledPublicationSnapshot(fixture, pending).valid)
    return { verifiedScheduledPublications: 1, publicationAttempts: 0 };
  if (
    !Array.isArray(pending?.items) ||
    pending.items.length !== 1 ||
    pending.items[0]?.id !== fixture.itemId ||
    pending.items[0].workflow_status !== "scheduled" ||
    Date.parse(pending.items[0].scheduled_for) !== dueAt
  )
    throw new Error("G7_SCHEDULED_PUBLICATION_PENDING_REFUSED");
  const result = await publishOnce(5_000);
  const schedulerRace = result?.error?.code === "23514" && result.error.message === "CMS_SCHEDULE_NOT_DUE";
  if (result?.error && !schedulerRace) throw new Error("G7_SCHEDULED_PUBLICATION_RPC_REFUSED");
  const final = validateScheduledPublicationSnapshot(fixture, await readSnapshot(5_000));
  if (!final.valid) throw new Error(`G7_SCHEDULED_PUBLICATION_STATE_REFUSED:${final.violations.join(",")}`);
  return { verifiedScheduledPublications: 1, publicationAttempts: 1, schedulerWonRace: schedulerRace };
}
