import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { invalidateCloudflareCache } from "../_shared/cloudflare-cache.ts";
import { EmailProviderError, leadNotificationEmail, sendEmail } from "../_shared/email.ts";
import { syncPublicSearchDocument } from "../_shared/cms-search-index.ts";
import {
  isExactMediaStoragePath,
  removeAndVerifyMediaStorageObject,
  removeAndVerifyStorageObject,
  type StorageRemovalError,
} from "../_shared/cms-storage-removal.ts";

type PendingDocumentBlob = {
  document_id: string;
  storage_path: string;
  processing_status: "awaiting_upload" | "finalizing" | "rejected" | "neutralized";
  source_kind: string;
  source_reference: string;
  expected_sha256: string | null;
  actor_id: string | null;
  candidate_sha: string | null;
  environment: string | null;
};

async function reconcileDocumentBlobs(admin: SupabaseClient) {
  const pending = await admin.rpc("cms_list_pending_document_blob_cleanup", { p_limit: 20 });
  if (pending.error)
    return { claimed: 0, completed: 0, failed: 1, discoveryFailed: true };
  let completed = 0;
  let failed = 0;
  for (const document of (pending.data ?? []) as PendingDocumentBlob[]) {
    const correlationId = crypto.randomUUID();
    const errorCode = await removeAndVerifyStorageObject(admin, document.storage_path);
    if (errorCode) {
      await admin.rpc("cms_record_document_blob_cleanup_failure", {
        p_document_id: document.document_id,
        p_storage_path: document.storage_path,
        p_error_code: errorCode,
        p_correlation_id: correlationId,
      });
      failed += 1;
      continue;
    }
    const confirmed = await admin.rpc("cms_confirm_document_blob_removal", {
      p_document_id: document.document_id,
      p_storage_path: document.storage_path,
      p_correlation_id: correlationId,
    });
    if (confirmed.error) {
      await admin.rpc("cms_record_document_blob_cleanup_failure", {
        p_document_id: document.document_id,
        p_storage_path: document.storage_path,
        p_error_code: "database_confirm_failed",
        p_correlation_id: correlationId,
      });
      failed += 1;
      continue;
    }
    completed += 1;
    if (
      document.source_kind === "synthetic_test" &&
      document.actor_id &&
      document.candidate_sha &&
      document.environment
    )
      await admin.rpc("cms_complete_qa_actor_lease", {
        p_actor_id: document.actor_id,
        p_run_tag: document.source_reference,
        p_candidate_sha: document.candidate_sha,
        p_environment: document.environment,
      });
  }
  return {
    claimed: (pending.data ?? []).length,
    completed,
    failed,
    discoveryFailed: false,
  };
}

type IncompleteMediaGcClaim = {
  jobId: string;
  claimId: string;
  verificationNonce: string;
  disposition: "incomplete_upload" | "retained_archive";
  paths: string[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validIncompleteMediaClaim(value: unknown): value is IncompleteMediaGcClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<IncompleteMediaGcClaim>;
  if (
    typeof claim.jobId !== "string" ||
    !uuidPattern.test(claim.jobId) ||
    typeof claim.claimId !== "string" ||
    !uuidPattern.test(claim.claimId) ||
    typeof claim.verificationNonce !== "string" ||
    !uuidPattern.test(claim.verificationNonce) ||
    (claim.disposition !== "incomplete_upload" && claim.disposition !== "retained_archive") ||
    !Array.isArray(claim.paths) ||
    claim.paths.length < 1 ||
    claim.paths.length > 7 ||
    (claim.disposition === "incomplete_upload" && claim.paths.length !== 7) ||
    new Set(claim.paths).size !== claim.paths.length ||
    !claim.paths.every((path) => typeof path === "string" && isExactMediaStoragePath(path))
  )
    return false;
  const generations = new Set(claim.paths.map((path) => path.split("/")[1]));
  return generations.size === 1;
}

async function verificationProof(claim: IncompleteMediaGcClaim): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${claim.verificationNonce}:${claim.claimId}:${claim.paths.join("|")}:absent`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function reconcileIncompleteMediaUploads(admin: SupabaseClient) {
  const workerId = crypto.randomUUID();
  const pending = await admin.rpc("cms_claim_incomplete_media_gc", {
    p_limit: 10,
    p_worker_id: workerId,
  });
  if (pending.error)
    return { claimed: 0, completed: 0, deferred: 0, failed: 1, discoveryFailed: true };
  const values = Array.isArray(pending.data) ? pending.data : [];
  let completed = 0;
  let deferred = 0;
  let failed = 0;
  for (const value of values) {
    if (!validIncompleteMediaClaim(value)) {
      failed += 1;
      continue;
    }
    const correlationId = crypto.randomUUID();
    const verifiedPaths: string[] = [];
    let errorCode: StorageRemovalError | null = null;
    for (const path of value.paths) {
      errorCode = await removeAndVerifyMediaStorageObject(admin, path);
      if (errorCode) break;
      verifiedPaths.push(path);
    }
    const succeeded = errorCode === null && verifiedPaths.length === value.paths.length;
    const proof = succeeded ? await verificationProof(value) : null;
    const finish = await admin.rpc("cms_finish_incomplete_media_gc", {
      p_job_id: value.jobId,
      p_claim_id: value.claimId,
      p_worker_id: workerId,
      p_succeeded: succeeded,
      p_error_code: succeeded ? null : errorCode ?? "storage_verify_failed",
      p_verified_paths: verifiedPaths,
      p_verification_proof: proof,
      p_correlation_id: correlationId,
    });
    if (finish.error || !succeeded) failed += 1;
    else if (finish.data?.status === "done") completed += 1;
    else if (finish.data?.status === "pending" && finish.data?.resweepRequired === true)
      deferred += 1;
    else failed += 1;
  }
  return { claimed: values.length, completed, deferred, failed, discoveryFailed: false };
}

Deno.serve(async (req) => {
  const startedAt = performance.now();
  const expected = Deno.env.get("OUTBOX_WORKER_SECRET"),
    supplied = req.headers.get("X-Worker-Secret");
  if (!expected || !supplied || supplied !== expected)
    return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401 });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405 });
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "Serviço indisponível." }), { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } }),
    correlationId = crypto.randomUUID();
  const documentBlobCleanup = await reconcileDocumentBlobs(admin);
  const incompleteMediaCleanup = await reconcileIncompleteMediaUploads(admin);
  const expiredCampaigns = await admin.rpc("cms_expire_campaigns", {
    p_limit: 50,
    p_correlation_id: correlationId,
  });
  const retainedCorporateLeads = await admin.rpc("cms_apply_lead_retention_scoped", {
    p_limit: 100,
    p_correlation_id: correlationId,
    p_scope: "corporate",
  });
  const retainedQaLeads = await admin.rpc("cms_apply_lead_retention_scoped", {
    p_limit: 100,
    p_correlation_id: correlationId,
    p_scope: "qa",
  });
  const breachedSlas = await admin.rpc("cms_enqueue_lead_sla_breaches", {
    p_limit: 100,
    p_correlation_id: correlationId,
  });
  if (
    expiredCampaigns.error ||
    retainedCorporateLeads.error ||
    retainedQaLeads.error ||
    breachedSlas.error
  )
    return new Response(JSON.stringify({ error: "Falha nas rotinas da Fase 7.", correlationId }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  const due = await admin
    .from("cms_content_items")
    .select("id")
    .eq("workflow_status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);
  let scheduled = 0;
  for (const item of due.data ?? []) {
    const result = await admin.rpc("cms_publish_due_schedule", {
      p_item_id: item.id,
      p_correlation_id: crypto.randomUUID(),
    });
    if (!result.error) scheduled += 1;
  }
  const dueReleases = await admin.rpc("cms_publish_due_releases", {
    p_limit: 10,
    p_correlation_id: correlationId,
  });
  if (dueReleases.error)
    return new Response(JSON.stringify({ error: "Falha nos releases agendados.", correlationId }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  const claimed = await admin.rpc("cms_claim_outbox", { p_limit: 20, p_worker_id: correlationId });
  if (claimed.error)
    return new Response(JSON.stringify({ error: "Falha ao reservar eventos.", correlationId }), {
      status: 503,
    });
  const publicationEvents = claimed.data ?? [];
  const simulateCacheFailure = req.headers.get("X-Simulate-Failure") === "true";
  const cacheInvalidation =
    publicationEvents.length === 0
      ? { ok: true, required: false, attempted: false, code: null, strategy: "not-needed" }
      : simulateCacheFailure
        ? {
            ok: false,
            required: true,
            attempted: false,
            code: "simulated_cache_failure",
            strategy: "simulation",
          }
        : await invalidateCloudflareCache({
            environment: Deno.env.get("CMS_ENVIRONMENT"),
            zoneId: Deno.env.get("CLOUDFLARE_ZONE_ID"),
            apiToken: Deno.env.get("CLOUDFLARE_CACHE_PURGE_TOKEN"),
          });
  let completed = 0,
    failed = 0,
    searchIndexed = 0,
    searchIndexFailed = 0;
  for (const event of publicationEvents) {
    const success = cacheInvalidation.ok;
    const finish = await admin.rpc("cms_finish_outbox", {
      p_id: event.id,
      p_success: success,
      p_error_code: success ? null : cacheInvalidation.code,
      p_correlation_id: event.correlation_id,
    });
    if (!finish.error && success) {
      completed += 1;
      try {
        await syncPublicSearchDocument(admin, event.item_id);
        searchIndexed += 1;
      } catch {
        searchIndexFailed += 1;
        await admin
          .from("cms_search_index_jobs")
          .insert({
            status: "pending",
            reason: `Sincronização pendente após outbox ${event.event_type}`,
            correlation_id: event.correlation_id,
          })
          .then(
            () => undefined,
            () => undefined,
          );
      }
    } else failed += 1;
  }
  const leadClaimed = await admin.rpc("cms_claim_lead_outbox_scoped", { p_limit: 20 });
  if (leadClaimed.error)
    return new Response(JSON.stringify({ error: "Falha na fila de leads.", correlationId }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  let leadCompleted = 0,
    leadFailed = 0,
    leadSkipped = 0;
  const resendKey = Deno.env.get("RESEND_API_KEY"),
    recipient = Deno.env.get("LEAD_NOTIFICATION_TO"),
    adminBaseUrl = Deno.env.get("CMS_ADMIN_URL");
  for (const event of leadClaimed.data ?? []) {
    let success = false,
      errorCode: string | null = null;
    try {
      if (event.delivery_allowed !== true || !event.reference_code) {
        leadSkipped += 1;
      } else {
        if (!resendKey || !recipient || !adminBaseUrl) throw new Error("lead_notification_not_configured");
        await sendEmail(
          resendKey,
          recipient
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          leadNotificationEmail(event.reference_code, event.event_type, adminBaseUrl),
        );
      }
      success = true;
    } catch (caught) {
      errorCode =
        caught instanceof Error && caught.message === "lead_not_found"
          ? "lead_not_found"
          : caught instanceof EmailProviderError
            ? `lead_notification_${caught.reason}`
            : "lead_notification_failed";
    }
    const finish = await admin.rpc("cms_finish_lead_outbox", {
      p_id: event.id,
      p_success: success,
      p_error_code: errorCode,
    });
    if (!finish.error && success) leadCompleted += 1;
    else leadFailed += 1;
  }
  const collaborationClaimed = await admin.rpc("cms_claim_collaboration_outbox", {
    p_limit: 50,
    p_worker_id: correlationId,
  });
  if (collaborationClaimed.error)
    return new Response(JSON.stringify({ error: "Falha na fila de colaboração.", correlationId }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  let collaborationCompleted = 0,
    collaborationFailed = 0;
  for (const event of collaborationClaimed.data ?? []) {
    const success = event.channel === "in_app";
    const finish = await admin.rpc("cms_finish_collaboration_outbox", {
      p_id: event.id,
      p_success: success,
      p_error_code: success ? null : "collaboration_email_not_configured",
    });
    if (!finish.error && success) collaborationCompleted += 1;
    else collaborationFailed += 1;
  }
  const degraded =
    documentBlobCleanup.failed > 0 ||
    documentBlobCleanup.discoveryFailed ||
    incompleteMediaCleanup.failed > 0 ||
    incompleteMediaCleanup.discoveryFailed ||
    failed > 0 ||
    searchIndexFailed > 0 ||
    leadFailed > 0 ||
    collaborationFailed > 0;
  return new Response(
    JSON.stringify({
      status: degraded ? "degraded" : "ok",
      durationMs: Math.round(performance.now() - startedAt),
      leadDurability: true,
      documentBlobCleanup,
      incompleteMediaCleanup,
      scheduled,
      dueReleases: dueReleases.data ?? { processed: 0, failed: 0, partialWrites: 0 },
      expiredCampaigns: expiredCampaigns.data ?? 0,
      retainedLeads:
        Number(retainedCorporateLeads.data ?? 0) + Number(retainedQaLeads.data ?? 0),
      retainedCorporateLeads: retainedCorporateLeads.data ?? 0,
      retainedQaLeads: retainedQaLeads.data ?? 0,
      breachedSlas: breachedSlas.data ?? 0,
      claimed: publicationEvents.length,
      completed,
      failed,
      cacheInvalidation,
      searchIndexed,
      searchIndexFailed,
      leadClaimed: leadClaimed.data?.length ?? 0,
      leadCompleted,
      leadFailed,
      leadSkipped,
      collaborationClaimed: collaborationClaimed.data?.length ?? 0,
      collaborationCompleted,
      collaborationFailed,
      correlationId,
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
});
