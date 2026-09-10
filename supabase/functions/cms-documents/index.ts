import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isEdgeFetchTimeout } from "../_shared/cms-edge-fetch.ts";
import { MAX_PDF_BYTES, validatePassivePdf } from "../_shared/cms-pdf-validation.ts";
import {
  removeAndVerifyStorageObject,
  retireSignedUploadObject,
  type StorageRemovalError,
} from "../_shared/cms-storage-removal.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  cleanText,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
  sha256,
  sha256Bytes,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const ScannerEngine = z.enum([
  "clamav-corporate-v1",
  "microsoft-defender-corporate-v1",
  "qa-synthetic-attestation-v1",
]);
const ScannerVerdict = z.enum(["clean", "malicious", "suspicious", "scan_failed"]);
const DocumentKind = z.enum(["datasheet", "manual", "certificate", "drawing", "software", "other"]);
const SourceKind = z.enum([
  "synthetic_test",
  "owner_authored",
  "official_manufacturer",
  "official_company",
]);
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime({ offset: true }),
    actorContext: z
      .object({
        environment: z.enum(["local", "staging", "production"]),
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();

const Metadata = z
  .object({
    originalFilename: z.string().trim().min(1).max(180).regex(/\.pdf$/i),
    declaredMime: z.literal("application/pdf"),
    kind: DocumentKind,
    title: z.string().trim().min(1).max(180),
    revision: z.string().trim().min(1).max(80),
    language: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/),
    visibility: z.enum(["public", "private"]),
    sourceKind: SourceKind,
    sourceReference: z.string().trim().min(3).max(500),
    licenseName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    rightsConfirmed: z.literal(true),
  })
  .strict();

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve_upload"), envelope: Envelope, metadata: Metadata }).strict(),
  z.object({ action: z.literal("finalize_upload"), envelope: Envelope, documentId: Uuid }).strict(),
  z
    .object({
      action: z.literal("list_security_review"),
      envelope: Envelope,
      query: z.string().trim().max(120).default(""),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("review_download"),
      envelope: Envelope,
      documentId: Uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("review_security"),
      envelope: Envelope,
      documentId: Uuid,
      expectedSha256: Sha256,
      decision: z.enum(["approve", "reject"]),
      scannerEngine: ScannerEngine,
      scannerVerdict: ScannerVerdict,
      evidenceSha256: Sha256,
      evidenceReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,179}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("neutralize_synthetic"),
      envelope: Envelope,
      documentId: Uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("list"),
      envelope: Envelope,
      query: z.string().trim().max(120).default(""),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("archive_document"),
      envelope: Envelope,
      documentId: Uuid,
      expectedLockVersion: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore_document"),
      envelope: Envelope,
      documentId: Uuid,
      expectedLockVersion: z.number().int().min(1),
    })
    .strict(),
]);

type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type DocumentRow = {
  id: string;
  storage_path: string;
  kind: z.infer<typeof DocumentKind>;
  title: string;
  revision: string;
  language: string;
  visibility: "public" | "private";
  sha256: string;
  rights_confirmed: boolean;
  byte_size: number;
  created_at: string;
  archived_at: string | null;
  lock_version: number;
  source_kind?: string;
  source_reference?: string;
};

type QaActorContext = {
  isQaActor: boolean;
  active: boolean;
  runTag: string | null;
  status: string | null;
};

type ScopedDocument = {
  source_kind: string;
  source_reference: string;
};

const PDF_PREFILTER_ENGINE = "pdf-passive-prefilter-v2";

function documentContract(row: DocumentRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    storagePath: row.storage_path,
    sha256: row.sha256,
    revision: row.revision,
    language: row.language,
    visibility: row.visibility,
    rightsConfirmed: row.rights_confirmed,
  };
}

function canonicalFilename(originalFilename: string): string {
  const basename = originalFilename.split(/[\\/]/).at(-1)?.replace(/\.pdf$/i, "") ?? "documento";
  const normalized = basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  return `${normalized || "documento"}.pdf`;
}

function originalFilename(value: string): string {
  return cleanText(value.split(/[\\/]/).at(-1), 180) || "documento.pdf";
}

async function authorized(identity: Identity, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id,
    p_permission: permission,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

async function qaActorContext(
  identity: Identity,
  environment: "local" | "staging" | "production",
): Promise<QaActorContext> {
  if (environment === "local")
    return { isQaActor: false, active: true, runTag: null, status: null };
  const context = await identity.admin.rpc("cms_document_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (context.error || typeof context.data !== "object" || !context.data)
    throw new Error("CMS_DOCUMENT_ACTOR_SCOPE_UNAVAILABLE");
  return {
    isQaActor: context.data.isQaActor === true,
    active: context.data.active === true,
    runTag: typeof context.data.runTag === "string" ? context.data.runTag : null,
    status: typeof context.data.status === "string" ? context.data.status : null,
  };
}

function actorCanAccessDocument(context: QaActorContext, asset: ScopedDocument): boolean {
  return context.isQaActor
    ? context.active &&
        asset.source_kind === "synthetic_test" &&
        asset.source_reference === context.runTag
    : asset.source_kind !== "synthetic_test";
}

function idempotencyKey(req: Request): string | null {
  const parsed = Uuid.safeParse(req.headers.get("X-Idempotency-Key"));
  return parsed.success ? parsed.data : null;
}

async function ensureCanonicalStorageObject(
  identity: Identity,
  storagePath: string,
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<"canonical_write_failed" | "canonical_collision" | null> {
  const bucket = identity.admin.storage.from("cms-documents-private");
  const uploaded = await bucket.upload(storagePath, bytes, {
    contentType: "application/pdf",
    cacheControl: "no-store",
    upsert: false,
  });
  if (!uploaded.error) return null;
  const existing = await bucket.download(storagePath);
  if (existing.error || !existing.data) return "canonical_write_failed";
  const observed = new Uint8Array(await existing.data.arrayBuffer());
  return (await sha256Bytes(observed)) === expectedSha256
    ? null
    : "canonical_collision";
}

async function retireAndRecordUploadPath(
  identity: Identity,
  documentId: string,
  uploadPath: string,
  tokenExpiresAt: string,
  correlationId: string,
): Promise<boolean> {
  const errorCode = await retireSignedUploadObject(identity.admin, uploadPath);
  const marked = await identity.admin.rpc("cms_mark_document_upload_retired", {
    p_document_id: documentId,
    p_upload_path: uploadPath,
    p_token_expires_at: tokenExpiresAt,
    p_guarded: errorCode === null,
    p_error_code: errorCode,
    p_correlation_id: correlationId,
  });
  return !marked.error && marked.data?.uploadDisposition === "guarded";
}

async function rejectReservation(
  identity: Identity,
  documentId: string,
  storagePath: string,
  uploadPath: string,
  tokenExpiresAt: string | null,
  finalizationClaimId: string | null,
  reasonCode: string,
  correlationId: string,
): Promise<"complete" | "cleanup_pending" | "state_failed"> {
  const rejected = await identity.admin.rpc("cms_reject_document_asset", {
    p_actor_id: identity.user.id,
    p_document_id: documentId,
    p_reason_code: reasonCode,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_finalization_claim_id: finalizationClaimId,
    p_correlation_id: correlationId,
  });
  if (rejected.error) return "state_failed";
  const canonicalRemoved = await finishRevokedBlobCleanup(
    identity,
    documentId,
    storagePath,
    correlationId,
  );
  const uploadSafe = tokenExpiresAt
    ? await retireAndRecordUploadPath(
        identity,
        documentId,
        uploadPath,
        tokenExpiresAt,
        correlationId,
      )
    : await finishRevokedBlobCleanup(identity, documentId, uploadPath, correlationId);
  return canonicalRemoved && uploadSafe
    ? "complete"
    : "cleanup_pending";
}

async function recordBlobCleanupFailure(
  identity: Identity,
  documentId: string,
  storagePath: string,
  errorCode: StorageRemovalError | "database_confirm_failed",
  correlationId: string,
) {
  await identity.admin.rpc("cms_record_document_blob_cleanup_failure", {
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_error_code: errorCode,
    p_correlation_id: correlationId,
  });
}

async function finishRevokedBlobCleanup(
  identity: Identity,
  documentId: string,
  storagePath: string,
  correlationId: string,
): Promise<boolean> {
  const removalError = await removeAndVerifyStorageObject(identity.admin, storagePath);
  if (removalError) {
    await recordBlobCleanupFailure(identity, documentId, storagePath, removalError, correlationId);
    return false;
  }
  const confirmed = await identity.admin.rpc("cms_confirm_document_blob_removal", {
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_correlation_id: correlationId,
  });
  if (confirmed.error) {
    await recordBlobCleanupFailure(
      identity,
      documentId,
      storagePath,
      "database_confirm_failed",
      correlationId,
    );
    return false;
  }
  return (
    confirmed.data?.blobDisposition === "removed" ||
    confirmed.data?.uploadDisposition === "removed"
  );
}

async function reserveUpload(
  req: Request,
  identity: Identity,
  metadata: z.infer<typeof Metadata>,
  environment: "local" | "staging" | "production",
  key: string,
  correlationId: string,
) {
  if (identity.claims.aal !== "aal2")
    return json(req, { error: "Confirme o MFA antes de enviar documentos.", code: "CMS_DOCUMENT_MFA_REQUIRED" }, 403);
  if (!(await authorized(identity, "cms:documents.upload")))
    return json(req, { error: "Permissão insuficiente para enviar documentos.", code: "CMS_DOCUMENT_FORBIDDEN" }, 403);
  const qaContext = await qaActorContext(identity, environment);
  if (
    (qaContext.isQaActor &&
      (!qaContext.active ||
        metadata.sourceKind !== "synthetic_test" ||
        qaContext.runTag !== metadata.sourceReference)) ||
    (!qaContext.isQaActor && metadata.sourceKind === "synthetic_test")
  )
    return json(
      req,
      {
        error: "A origem sintética exige a lease QA exata; atores QA não podem registrar fontes reais.",
        code: "CMS_DOCUMENT_SYNTHETIC_SCOPE_INVALID",
      },
      403,
    );
  const documentId = crypto.randomUUID();
  const filename = canonicalFilename(metadata.originalFilename);
  const storagePath = `cms-documents/${documentId}/${filename}`;
  const uploadPath = `cms-document-uploads/${documentId}/${filename}`;
  const requestHash = await sha256(JSON.stringify(metadata));
  const { data, error } = await identity.admin.rpc("cms_reserve_document_asset", {
    p_actor_id: identity.user.id,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_upload_path: uploadPath,
    p_original_filename: originalFilename(metadata.originalFilename),
    p_kind: metadata.kind,
    p_title: metadata.title,
    p_revision: metadata.revision,
    p_language: metadata.language,
    p_visibility: metadata.visibility,
    p_source_kind: metadata.sourceKind,
    p_source_reference: metadata.sourceReference,
    p_license_name: metadata.licenseName,
    p_owner_name: metadata.ownerName,
    p_rights_confirmed: metadata.rightsConfirmed,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_idempotency_key: key,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (error) throw error;
  const reserved = data as {
    document: { id: string; storagePath: string; uploadPath: string };
    correlationId: string;
  };
  const current = await identity.admin
    .from("cms_document_assets")
    .select("id,processing_status,upload_disposition")
    .eq("id", reserved.document.id)
    .single();
  if (
    current.error ||
    !current.data ||
    current.data.processing_status !== "awaiting_upload" ||
    current.data.upload_disposition !== "reserved"
  )
    return json(
      req,
      { error: "A reserva de upload já foi encerrada.", code: "CMS_DOCUMENT_UPLOAD_TOKEN_CLOSED" },
      409,
    );
  const signed = await identity.admin.storage
    .from("cms-documents-private")
    .createSignedUploadUrl(reserved.document.uploadPath, { upsert: false });
  if (signed.error) {
    await rejectReservation(
      identity,
      reserved.document.id,
      reserved.document.storagePath,
      reserved.document.uploadPath,
      null,
      null,
      "upload_signing_failed",
      reserved.correlationId,
    );
    return json(req, { error: "Não foi possível preparar o upload.", code: "CMS_DOCUMENT_UPLOAD_SIGNING_FAILED" }, 503);
  }
  const tokenExpiresAt = new Date(Date.now() + 120 * 60_000).toISOString();
  const tokenRecorded = await identity.admin.rpc("cms_mark_document_upload_token_issued", {
    p_document_id: reserved.document.id,
    p_upload_path: reserved.document.uploadPath,
    p_token_expires_at: tokenExpiresAt,
    p_correlation_id: reserved.correlationId,
  });
  if (tokenRecorded.error) {
    await rejectReservation(
      identity,
      reserved.document.id,
      reserved.document.storagePath,
      reserved.document.uploadPath,
      tokenExpiresAt,
      null,
      "upload_token_state_failed",
      reserved.correlationId,
    );
    return json(
      req,
      { error: "Não foi possível registrar o upload governado.", code: "CMS_DOCUMENT_UPLOAD_STATE_FAILED" },
      503,
    );
  }
  return json(
    req,
    {
      documentId: reserved.document.id,
      storagePath: reserved.document.storagePath,
      signedUrl: signed.data.signedUrl,
      uploadExpiresAt: tokenExpiresAt,
      status: "awaiting_upload",
      correlationId: reserved.correlationId,
    },
    201,
  );
}

async function finalizeUpload(
  req: Request,
  identity: Identity,
  documentId: string,
  key: string,
  correlationId: string,
  environment: "local" | "staging" | "production",
) {
  if (identity.claims.aal !== "aal2")
    return json(req, { error: "Confirme o MFA antes de enviar documentos.", code: "CMS_DOCUMENT_MFA_REQUIRED" }, 403);
  if (!(await authorized(identity, "cms:documents.upload")))
    return json(req, { error: "Permissão insuficiente para enviar documentos.", code: "CMS_DOCUMENT_FORBIDDEN" }, 403);

  const { data: asset, error: assetError } = await identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,upload_path,created_by,processing_status,blob_disposition,upload_disposition,upload_token_expires_at,source_kind,source_reference,sha256,byte_size",
    )
    .eq("id", documentId)
    .single();
  if (assetError || !asset) return json(req, { error: "Documento não encontrado." }, 404);
  const qaContext = await qaActorContext(identity, environment);
  if (!actorCanAccessDocument(qaContext, asset))
    return json(
      req,
      { error: "O documento não pertence ao escopo deste ator.", code: "CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN" },
      403,
    );
  if (asset.created_by !== identity.user.id && !(await authorized(identity, "cms:documents.manage")))
    return json(req, { error: "Somente o autor ou um gestor pode finalizar este documento." }, 403);
  if (asset.processing_status === "rejected") {
    const canonicalComplete =
      asset.blob_disposition === "removed" ||
      (await finishRevokedBlobCleanup(identity, documentId, asset.storage_path, correlationId));
    const uploadComplete = ["guarded", "removed"].includes(asset.upload_disposition)
      ? true
      : asset.upload_token_expires_at
        ? await retireAndRecordUploadPath(
            identity,
            documentId,
            asset.upload_path,
            asset.upload_token_expires_at,
            correlationId,
          )
        : await finishRevokedBlobCleanup(identity, documentId, asset.upload_path, correlationId);
    const cleanupComplete = canonicalComplete && uploadComplete;
    return cleanupComplete
      ? json(
          req,
          { error: "Este PDF já foi rejeitado.", code: "CMS_DOCUMENT_FILE_REJECTED" },
          422,
        )
      : json(
          req,
          {
            error: "O PDF foi rejeitado e sua remoção física está pendente de nova tentativa.",
            code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
            correlationId,
          },
          503,
        );
  }
  const invokeFinalize = (digest: string, byteSize: number) => {
    const requestHashPromise = sha256(JSON.stringify({ documentId, digest, byteSize }));
    return requestHashPromise.then((requestHash) =>
      identity.admin.rpc("cms_finalize_document_asset", {
        p_actor_id: identity.user.id,
        p_document_id: documentId,
        p_byte_size: byteSize,
        p_sha256: digest,
        p_scan_engine: PDF_PREFILTER_ENGINE,
        p_aal: identity.claims.aal,
        p_session_id: identity.claims.sessionId,
        p_issued_at: identity.claims.issuedAt,
        p_idempotency_key: key,
        p_request_hash: requestHash,
        p_correlation_id: correlationId,
      }),
    );
  };
  if (["quarantined", "ready"].includes(asset.processing_status)) {
    if (!asset.sha256 || !asset.byte_size)
      return json(req, { error: "Estado finalizado inconsistente.", code: "CMS_DOCUMENT_STATE_INVALID" }, 503);
    const replay = await invokeFinalize(asset.sha256, asset.byte_size);
    if (replay.error) throw replay.error;
    const uploadSafe = ["guarded", "removed"].includes(asset.upload_disposition)
      ? true
      : await retireAndRecordUploadPath(
          identity,
          documentId,
          asset.upload_path,
          asset.upload_token_expires_at,
          correlationId,
        );
    return uploadSafe
      ? json(req, replay.data, 200)
      : json(
          req,
          {
            error: "O documento foi finalizado, mas o caminho temporário ainda exige reconciliação.",
            code: "CMS_DOCUMENT_UPLOAD_RETIREMENT_PENDING",
            correlationId,
          },
          503,
        );
  }
  const claimed = await identity.admin.rpc("cms_claim_document_finalization", {
    p_actor_id: identity.user.id,
    p_document_id: documentId,
    p_claim_id: key,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_correlation_id: correlationId,
  });
  if (claimed.error) throw claimed.error;
  if (["quarantined", "ready"].includes(claimed.data?.status)) {
    const digest = String(claimed.data?.sha256 ?? "");
    const byteSize = Number(claimed.data?.byteSize ?? 0);
    if (!Sha256.safeParse(digest).success || !Number.isInteger(byteSize) || byteSize < 8)
      return json(req, { error: "Estado finalizado inconsistente.", code: "CMS_DOCUMENT_STATE_INVALID" }, 503);
    const replay = await invokeFinalize(digest, byteSize);
    if (replay.error) throw replay.error;
    const uploadSafe = ["guarded", "removed"].includes(asset.upload_disposition)
      ? true
      : await retireAndRecordUploadPath(
          identity,
          documentId,
          asset.upload_path,
          asset.upload_token_expires_at,
          correlationId,
        );
    return uploadSafe ? json(req, replay.data, 200) : json(req, {
      error: "A retirada do caminho temporário está pendente.",
      code: "CMS_DOCUMENT_UPLOAD_RETIREMENT_PENDING",
      correlationId,
    }, 503);
  }

  const downloaded = await identity.admin.storage.from("cms-documents-private").download(asset.upload_path);
  if (downloaded.error)
    return json(req, { error: "O arquivo ainda não foi enviado.", code: "CMS_DOCUMENT_UPLOAD_MISSING" }, 409);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const rejection = validatePassivePdf(bytes);
  if (rejection) {
    const cleanup = await rejectReservation(
      identity,
      documentId,
      asset.storage_path,
      asset.upload_path,
      asset.upload_token_expires_at,
      key,
      rejection,
      correlationId,
    );
    if (cleanup === "state_failed")
      return json(
        req,
        {
          error: "Não foi possível persistir a rejeição governada do PDF.",
          code: "CMS_DOCUMENT_REJECTION_STATE_UNAVAILABLE",
          correlationId,
        },
        503,
      );
    return cleanup === "complete"
      ? json(
          req,
          {
            error: "PDF rejeitado por estrutura, conteúdo ativo ou tamanho.",
            code: "CMS_DOCUMENT_FILE_REJECTED",
          },
          422,
        )
      : json(
          req,
          {
            error: "O PDF foi rejeitado e sua remoção física está pendente de nova tentativa.",
            code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
            correlationId,
          },
          503,
        );
  }
  const digest = await sha256Bytes(bytes);
  const { data: duplicateCandidates, error: duplicateLookupError } = await identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,kind,title,revision,language,visibility,sha256,rights_confirmed,byte_size,created_at,source_kind,source_reference",
    )
    .eq("sha256", digest)
    .in("processing_status", ["quarantined", "ready"])
    .is("archived_at", null)
    .neq("id", documentId);
  if (duplicateLookupError) throw duplicateLookupError;
  const duplicateInActorScope = (duplicateCandidates ?? []).find((candidate) =>
    actorCanAccessDocument(qaContext, candidate as ScopedDocument)
  ) as DocumentRow | undefined;
  if (duplicateInActorScope) {
    const cleanup = await rejectReservation(
      identity,
      documentId,
      asset.storage_path,
      asset.upload_path,
      asset.upload_token_expires_at,
      key,
      "duplicate_sha256",
      correlationId,
    );
    if (cleanup === "state_failed")
      return json(
        req,
        {
          error: "Não foi possível persistir a rejeição governada do PDF duplicado.",
          code: "CMS_DOCUMENT_REJECTION_STATE_UNAVAILABLE",
          correlationId,
        },
        503,
      );
    return cleanup === "complete"
      ? json(
          req,
          {
            error: "Este PDF já existe na biblioteca; reutilize o documento existente.",
            code: "CMS_DOCUMENT_DUPLICATE",
            existingDocument: documentContract(duplicateInActorScope),
          },
          409,
        )
      : json(
          req,
          {
            error: "O PDF duplicado foi rejeitado e sua remoção física está pendente.",
            code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
            correlationId,
          },
          503,
        );
  }
  const canonicalWrite = await ensureCanonicalStorageObject(
    identity,
    asset.storage_path,
    bytes,
    digest,
  );
  if (canonicalWrite === "canonical_write_failed")
    return json(
      req,
      {
        error: "Não foi possível persistir o PDF na área canônica.",
        code: "CMS_DOCUMENT_CANONICAL_WRITE_FAILED",
        correlationId,
      },
      503,
    );
  if (canonicalWrite === "canonical_collision") {
    const cleanup = await rejectReservation(
      identity,
      documentId,
      asset.storage_path,
      asset.upload_path,
      asset.upload_token_expires_at,
      key,
      "canonical_collision",
      correlationId,
    );
    return json(
      req,
      {
        error: "O caminho canônico apresentou conteúdo divergente e foi bloqueado.",
        code: cleanup === "complete"
          ? "CMS_DOCUMENT_CANONICAL_COLLISION"
          : "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
        correlationId,
      },
      cleanup === "complete" ? 409 : 503,
    );
  }
  let finalized = await invokeFinalize(digest, bytes.byteLength);
  if (finalized.error) {
    const observed = await identity.admin
      .from("cms_document_assets")
      .select("processing_status,sha256,byte_size,blob_disposition,archived_at")
      .eq("id", documentId)
      .single();
    if (
      !observed.error &&
      observed.data &&
      ["quarantined", "ready"].includes(observed.data.processing_status) &&
      observed.data.sha256 === digest &&
      observed.data.byte_size === bytes.byteLength
    )
      finalized = await invokeFinalize(digest, bytes.byteLength);
    if (finalized.error) {
      const terminalAfterClaim =
        !observed.error &&
        observed.data &&
        (["rejected", "neutralized"].includes(observed.data.processing_status) ||
          ["access_revoked", "removed"].includes(observed.data.blob_disposition) ||
          Boolean(observed.data.archived_at));
      if (terminalAfterClaim) {
        const removed = await finishRevokedBlobCleanup(
          identity,
          documentId,
          asset.storage_path,
          correlationId,
        );
        return json(
          req,
          {
            error: removed
              ? "A finalização foi revogada e o objeto canônico foi removido."
              : "A finalização foi revogada; a remoção do objeto canônico será reconciliada.",
            code: removed
              ? "CMS_DOCUMENT_FINALIZATION_REVOKED"
              : "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
            correlationId,
          },
          removed ? 409 : 503,
        );
      }
      const isDuplicateRace =
        finalized.error.code === "23505" ||
        String(finalized.error.message ?? "").includes("CMS_DOCUMENT_DUPLICATE");
      if (!isDuplicateRace) throw finalized.error;
      const cleanup = await rejectReservation(
        identity,
        documentId,
        asset.storage_path,
        asset.upload_path,
        asset.upload_token_expires_at,
        key,
        "duplicate_sha256",
        correlationId,
      );
      return json(
        req,
        {
          error: "Este PDF já existe na biblioteca; reutilize o documento autorizado existente.",
          code:
            cleanup === "complete"
              ? "CMS_DOCUMENT_DUPLICATE"
              : "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
          correlationId,
        },
        cleanup === "complete" ? 409 : 503,
      );
    }
  }
  if (
    !asset.upload_token_expires_at ||
    !(await retireAndRecordUploadPath(
      identity,
      documentId,
      asset.upload_path,
      asset.upload_token_expires_at,
      correlationId,
    ))
  )
    return json(
      req,
      {
        error: "O PDF foi finalizado, mas a retirada do caminho temporário deve ser repetida.",
        code: "CMS_DOCUMENT_UPLOAD_RETIREMENT_PENDING",
        correlationId,
      },
      503,
    );
  return json(req, finalized.data, 200);
}

async function listSecurityReview(
  req: Request,
  identity: Identity,
  input: Extract<z.infer<typeof Input>, { action: "list_security_review" }>,
) {
  if (
    identity.claims.aal !== "aal2" ||
    !(await authorized(identity, "cms:documents.security_review"))
  )
    return json(
      req,
      {
        error: "MFA e permissão de revisão de segurança são obrigatórios.",
        code: "CMS_DOCUMENT_SECURITY_REVIEW_FORBIDDEN",
      },
      403,
    );
  const from = (input.page - 1) * input.pageSize;
  const qaContext = await qaActorContext(identity, input.envelope.actorContext.environment);
  if (qaContext.isQaActor && !qaContext.active)
    return json(
      req,
      { error: "A lease QA não está ativa.", code: "CMS_DOCUMENT_QA_LEASE_INACTIVE" },
      403,
    );
  let query = identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,kind,title,revision,language,visibility,sha256,rights_confirmed,byte_size,created_at,created_by,source_kind,source_reference,prefilter_engine,prefiltered_at,archived_at,lock_version",
      { count: "exact" },
    )
    .eq("processing_status", "quarantined")
    .eq("scan_status", "pending")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .range(from, from + input.pageSize - 1);
  query = qaContext.isQaActor
    ? query.eq("source_kind", "synthetic_test").eq("source_reference", qaContext.runTag)
    : query.neq("source_kind", "synthetic_test");
  const normalized = input.query.replace(/[%_,()]/g, "").trim();
  if (normalized) query = query.ilike("title", `%${normalized}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      let qaSyntheticAttestationAllowed = false;
      if (
        row.source_kind === "synthetic_test" &&
        input.envelope.actorContext.environment !== "local" &&
        row.created_by !== identity.user.id
      ) {
        const eligibility = await identity.admin.rpc("cms_document_qa_attestation_allowed", {
          p_actor_id: identity.user.id,
          p_document_id: row.id,
          p_environment: input.envelope.actorContext.environment,
        });
        if (eligibility.error) throw eligibility.error;
        qaSyntheticAttestationAllowed = eligibility.data === true;
      }
      return {
        document: documentContract(row as DocumentRow),
        byteSize: row.byte_size,
        createdAt: row.created_at,
        sourceKind: row.source_kind,
        prefilterEngine: row.prefilter_engine,
        prefilteredAt: row.prefiltered_at,
        lockVersion: row.lock_version,
        canReview: row.created_by !== identity.user.id,
        qaSyntheticAttestationAllowed,
      };
    }),
  );
  return json(req, {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total: count ?? 0,
  });
}

async function reviewDownload(
  req: Request,
  identity: Identity,
  documentId: string,
  correlationId: string,
  environment: "local" | "staging" | "production",
) {
  if (
    identity.claims.aal !== "aal2" ||
    !(await authorized(identity, "cms:documents.security_review"))
  )
    return json(
      req,
      {
        error: "MFA e permissão de revisão de segurança são obrigatórios.",
        code: "CMS_DOCUMENT_SECURITY_REVIEW_FORBIDDEN",
      },
      403,
    );
  const { data: asset, error } = await identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,original_filename,sha256,created_by,source_kind,source_reference,processing_status,scan_status,archived_at",
    )
    .eq("id", documentId)
    .single();
  if (error || !asset) return json(req, { error: "Documento não encontrado." }, 404);
  const qaContext = await qaActorContext(identity, environment);
  if (!actorCanAccessDocument(qaContext, asset))
    return json(
      req,
      { error: "O documento não pertence ao escopo deste ator.", code: "CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN" },
      403,
    );
  if (
    asset.created_by === identity.user.id ||
    asset.processing_status !== "quarantined" ||
    asset.scan_status !== "pending" ||
    asset.archived_at
  )
    return json(
      req,
      {
        error: "O download de revisão exige segundo ator e documento em quarentena.",
        code: "CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED",
      },
      409,
    );
  if (asset.source_kind === "synthetic_test") {
    const eligibility = await identity.admin.rpc("cms_document_qa_attestation_allowed", {
      p_actor_id: identity.user.id,
      p_document_id: asset.id,
      p_environment: environment,
    });
    if (eligibility.error || eligibility.data !== true)
      return json(
        req,
        {
          error: "O download sintético exige a mesma lease QA ativa do autor.",
          code: "CMS_DOCUMENT_QA_ATTESTATION_INVALID",
        },
        403,
      );
  }
  const signed = await identity.admin.storage
    .from("cms-documents-private")
    .createSignedUrl(asset.storage_path, 300, { download: asset.original_filename });
  if (signed.error)
    return json(
      req,
      { error: "Não foi possível preparar o download isolado para o scanner.", correlationId },
      503,
    );
  const audit = await identity.admin.from("cms_audit_log").insert({
    actor_id: identity.user.id,
    action: "cms:documents.review_download",
    target_type: "document_asset",
    target_id: asset.id,
    event_data: { expectedSha256: asset.sha256, disposition: "attachment", expiresInSeconds: 300 },
    correlation_id: correlationId,
  });
  if (audit.error) throw audit.error;
  return json(req, {
    documentId: asset.id,
    expectedSha256: asset.sha256,
    signedUrl: signed.data.signedUrl,
    disposition: "attachment",
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    correlationId,
  });
}

async function reviewSecurity(
  req: Request,
  identity: Identity,
  input: Extract<z.infer<typeof Input>, { action: "review_security" }>,
  key: string,
  correlationId: string,
) {
  if (
    identity.claims.aal !== "aal2" ||
    !(await authorized(identity, "cms:documents.security_review"))
  )
    return json(
      req,
      {
        error: "MFA e permissão de revisão de segurança são obrigatórios.",
        code: "CMS_DOCUMENT_SECURITY_REVIEW_FORBIDDEN",
      },
      403,
    );
  if (
    (input.decision === "approve" && input.scannerVerdict !== "clean") ||
    (input.decision === "reject" && input.scannerVerdict === "clean")
  )
    return json(
      req,
      { error: "A decisão não corresponde ao veredito do scanner.", code: "CMS_DOCUMENT_SECURITY_DECISION_INVALID" },
      422,
    );
  const { data: asset, error: assetError } = await identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,sha256,created_by,source_kind,source_reference,processing_status,scan_status,archived_at,blob_disposition",
    )
    .eq("id", input.documentId)
    .single();
  if (assetError || !asset) return json(req, { error: "Documento não encontrado." }, 404);
  const qaContext = await qaActorContext(identity, input.envelope.actorContext.environment);
  if (!actorCanAccessDocument(qaContext, asset))
    return json(
      req,
      { error: "O documento não pertence ao escopo deste ator.", code: "CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN" },
      403,
    );
  if (asset.created_by === identity.user.id)
    return json(
      req,
      {
        error: "A revisão de segurança exige um segundo ator diferente do autor do upload.",
        code: "CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED",
      },
      409,
    );
  if (asset.sha256 !== input.expectedSha256)
    return json(
      req,
      { error: "O SHA-256 informado não corresponde à quarentena.", code: "CMS_DOCUMENT_REVIEW_SHA_MISMATCH" },
      409,
    );
  if (
    (input.scannerEngine === "qa-synthetic-attestation-v1") !==
    (asset.source_kind === "synthetic_test")
  )
    return json(
      req,
      { error: "A atestação QA é restrita ao fixture sintético controlado.", code: "CMS_DOCUMENT_QA_ATTESTATION_INVALID" },
      403,
    );
  const requestHash = await sha256(
    JSON.stringify({
      documentId: input.documentId,
      expectedSha256: input.expectedSha256,
      decision: input.decision,
      scannerEngine: input.scannerEngine,
      scannerVerdict: input.scannerVerdict,
      evidenceSha256: input.evidenceSha256,
      evidenceReference: input.evidenceReference,
    }),
  );
  const invokeReview = () =>
    identity.admin.rpc("cms_review_document_security", {
      p_actor_id: identity.user.id,
      p_document_id: input.documentId,
      p_expected_sha256: input.expectedSha256,
      p_decision: input.decision,
      p_scanner_engine: input.scannerEngine,
      p_scanner_verdict: input.scannerVerdict,
      p_evidence_sha256: input.evidenceSha256,
      p_evidence_reference: input.evidenceReference,
      p_environment: input.envelope.actorContext.environment,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
      p_idempotency_key: key,
      p_request_hash: requestHash,
      p_correlation_id: correlationId,
    });
  if (
    asset.processing_status !== "quarantined" ||
    asset.scan_status !== "pending" ||
    asset.archived_at
  ) {
    // Somente o RPC pode distinguir um replay exato de uma nova decisao sobre
    // um estado terminal; ele consulta o recibo imutavel antes de falhar fechado.
    const replay = await invokeReview();
    if (replay.error) throw replay.error;
    if (
      input.decision === "reject" &&
      asset.blob_disposition !== "removed" &&
      !(await finishRevokedBlobCleanup(identity, asset.id, asset.storage_path, correlationId))
    )
      return json(
        req,
        {
          error: "O documento foi rejeitado e sua remoção física está pendente.",
          code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
          correlationId,
        },
        503,
      );
    return json(req, replay.data, 200);
  }
  if (input.scannerEngine === "qa-synthetic-attestation-v1") {
    const eligibility = await identity.admin.rpc("cms_document_qa_attestation_allowed", {
      p_actor_id: identity.user.id,
      p_document_id: asset.id,
      p_environment: input.envelope.actorContext.environment,
    });
    if (eligibility.error || eligibility.data !== true)
      return json(
        req,
        {
          error: "A atestação QA exige leases sintéticas exatas e ainda ativas para os dois atores.",
          code: "CMS_DOCUMENT_QA_ATTESTATION_INVALID",
        },
        403,
      );
  }
  const stored = await identity.admin.storage.from("cms-documents-private").download(asset.storage_path);
  if (stored.error)
    return json(
      req,
      { error: "Não foi possível reler o objeto em quarentena.", code: "CMS_DOCUMENT_REVIEW_OBJECT_UNAVAILABLE" },
      503,
    );
  const storedBytes = new Uint8Array(await stored.data.arrayBuffer());
  const currentStructuralRejection = validatePassivePdf(storedBytes);
  const currentSha256 = await sha256Bytes(storedBytes);
  if (
    currentStructuralRejection ||
    currentSha256 !== input.expectedSha256 ||
    currentSha256 !== asset.sha256
  ) {
    const audit = await identity.admin.from("cms_audit_log").insert({
      actor_id: identity.user.id,
      action: "cms:documents.security_integrity_failure",
      target_type: "document_asset",
      target_id: asset.id,
      event_data: {
        expectedSha256: input.expectedSha256,
        recordedSha256: asset.sha256,
        observedSha256: currentSha256,
        structuralRejection: currentStructuralRejection ?? null,
      },
      correlation_id: correlationId,
    });
    if (audit.error) throw audit.error;
    return json(
      req,
      {
        error: "Os bytes em quarentena mudaram ou deixaram de passar no pré-filtro; a revisão foi bloqueada.",
        code: "CMS_DOCUMENT_REVIEW_BYTES_CHANGED",
        correlationId,
      },
      409,
    );
  }
  const { data, error } = await invokeReview();
  if (error) throw error;
  if (
    input.decision === "reject" &&
    !(await finishRevokedBlobCleanup(identity, asset.id, asset.storage_path, correlationId))
  )
    return json(
      req,
      {
        error: "O documento foi rejeitado e sua remoção física está pendente.",
        code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
        correlationId,
      },
      503,
    );
  return json(req, data, 200);
}

// A causa da recusa precisa chegar ao operador sem carregar texto livre: um SQLSTATE tem forma
// fechada de cinco caracteres, e o prazo de saida das funcoes de borda ja tem codigo proprio.
function confirmCause(sqlState: string, message: string): string {
  if (/^[0-9A-Z]{5}$/.test(sqlState)) return sqlState;
  if (message.includes("CMS_EDGE_FETCH_TIMEOUT")) return "FETCH_TIMEOUT";
  return "UNKNOWN";
}

async function neutralizeSynthetic(
  req: Request,
  identity: Identity,
  documentId: string,
  environment: "local" | "staging" | "production",
  key: string,
  correlationId: string,
) {
  if (
    identity.claims.aal !== "aal2" ||
    !(await authorized(identity, "cms:documents.manage"))
  )
    return json(
      req,
      {
        error: "MFA e permissão de gestão são obrigatórios para neutralizar o fixture.",
        code: "CMS_DOCUMENT_NEUTRALIZE_FORBIDDEN",
      },
      403,
    );
  if (environment === "local")
    return json(
      req,
      { error: "A neutralização governada exige staging ou produção.", code: "CMS_DOCUMENT_SCOPE_MISMATCH" },
      403,
    );
  const scoped = await identity.admin
    .from("cms_document_assets")
    .select("source_kind,source_reference")
    .eq("id", documentId)
    .single();
  if (scoped.error || !scoped.data) return json(req, { error: "Documento não encontrado." }, 404);
  const qaContext = await qaActorContext(identity, environment);
  if (
    !qaContext.isQaActor ||
    !qaContext.active ||
    !actorCanAccessDocument(qaContext, scoped.data)
  )
    return json(
      req,
      { error: "A neutralização exige a lease QA ativa do mesmo run.", code: "CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN" },
      403,
    );

  const prepared = await identity.admin.rpc("cms_prepare_synthetic_document_neutralization", {
    p_actor_id: identity.user.id,
    p_document_id: documentId,
    p_environment: environment,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_correlation_id: correlationId,
  });
  if (prepared.error) throw prepared.error;
  const asset = prepared.data as {
    documentId: string;
    expectedSha256: string;
    storagePath: string;
  };
  const removalError = await removeAndVerifyStorageObject(identity.admin, asset.storagePath);
  if (removalError) {
    await recordBlobCleanupFailure(
      identity,
      asset.documentId,
      asset.storagePath,
      removalError,
      correlationId,
    );
    return json(
      req,
      {
        error: "O acesso foi revogado, mas a remoção física do arquivo precisa ser repetida.",
        code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
        correlationId,
      },
      503,
    );
  }

  const requestHash = await sha256(
    JSON.stringify({ documentId: asset.documentId, expectedSha256: asset.expectedSha256 }),
  );
  const confirmRemoval = () =>
    identity.admin.rpc("cms_confirm_synthetic_document_removal", {
      p_actor_id: identity.user.id,
      p_document_id: asset.documentId,
      p_expected_sha256: asset.expectedSha256,
      p_environment: environment,
      p_aal: identity.claims.aal,
      p_session_id: identity.claims.sessionId,
      p_issued_at: identity.claims.issuedAt,
      p_idempotency_key: key,
      p_request_hash: requestHash,
      p_correlation_id: correlationId,
    });
  let confirmed = await confirmRemoval();
  // A confirmacao e idempotente por construcao: a mesma chave de idempotencia devolve o recibo ja
  // gravado em vez de escrever de novo. Um prazo de transporte estourado nao diz se o servidor
  // chegou a receber o pedido, e essa e exatamente a situacao em que repetir uma vez e seguro. Uma
  // recusa deliberada, como o fence canonico, nao e repetida.
  if (confirmed.error && isEdgeFetchTimeout(confirmed.error)) confirmed = await confirmRemoval();
  // O fence canonico de 0063 recusa marcar o blob como removido enquanto o token de upload assinado
  // ainda puder escrever no caminho. Esse e o desfecho projetado da neutralizacao dentro da janela,
  // nao uma falha: o acesso ja foi revogado, o objeto ja saiu do Storage, e a escritura canonica fica
  // agendada para o reconciliador de blobs. Tratar isso como falha registrava um erro inexistente e
  // devolvia 503 para uma operacao que deu certo.
  const confirmMessage = String((confirmed.error as { message?: string } | null)?.message ?? "");
  const confirmSqlState = String((confirmed.error as { code?: string } | null)?.code ?? "");
  const canonicalFenceActive =
    confirmMessage.includes("CMS_DOCUMENT_CANONICAL_WRITE_FENCE_ACTIVE") || confirmSqlState === "40001";
  // Um prazo de transporte estourado nao e uma recusa: e ausencia de resposta. O que importa para a
  // seguranca ja esta duravel neste ponto, porque o acesso foi revogado pela preparacao, que
  // commitou, e o objeto foi removido do Storage e conferido ausente logo acima. O que falta e
  // apenas a escritura canonica, que o fence proibiria de qualquer forma dentro da janela do run e
  // que pertence ao reconciliador de blobs. Ele encontra o documento por
  // `cms_list_pending_document_blob_cleanup` sem depender de nenhum registro de falha, e o documento
  // do run anterior foi observado ja em `removed`, o que prova que ele conclui.
  const confirmationDeadline = Boolean(confirmed.error) && isEdgeFetchTimeout(confirmed.error);
  if (confirmed.error && (canonicalFenceActive || confirmationDeadline))
    return json(
      req,
      {
        documentId: asset.documentId,
        status: "neutralized",
        blobDisposition: "access_revoked",
        canonicalCleanupScheduled: true,
        canonicalCleanupReason: canonicalFenceActive ? "canonical_write_fence" : "confirmation_deadline",
        correlationId,
      },
      200,
    );
  if (confirmed.error) {
    await recordBlobCleanupFailure(
      identity,
      asset.documentId,
      asset.storagePath,
      "database_confirm_failed",
      correlationId,
    );
    return json(
      req,
      {
        error: "O arquivo foi removido, mas a confirmação de segurança precisa ser repetida.",
        // Um unico codigo para toda causa deixou um run reprovar sem dizer o que recusou a
        // confirmacao. A causa entra no proprio codigo, e apenas em forma fechada: um SQLSTATE, o
        // prazo de saida estourado, ou desconhecida. Nada do corpo do erro e ecoado.
        code: `CMS_DOCUMENT_BLOB_CONFIRM_FAILED_${confirmCause(confirmSqlState, confirmMessage)}`,
        correlationId,
      },
      503,
    );
  }
  return json(req, confirmed.data, 200);
}

async function listDocuments(
  req: Request,
  identity: Identity,
  input: Extract<z.infer<typeof Input>, { action: "list" }>,
) {
  if (!(await authorized(identity, "cms:documents.read")))
    return json(req, { error: "Permissão insuficiente para consultar documentos." }, 403);
  if (
    input.includeArchived &&
    (identity.claims.aal !== "aal2" || !(await authorized(identity, "cms:documents.manage")))
  )
    return json(
      req,
      { error: "MFA e permissão de gestão são necessários para consultar documentos arquivados." },
      403,
    );
  const from = (input.page - 1) * input.pageSize;
  const qaContext = await qaActorContext(identity, input.envelope.actorContext.environment);
  if (qaContext.isQaActor && !qaContext.active)
    return json(
      req,
      { error: "A lease QA não está ativa.", code: "CMS_DOCUMENT_QA_LEASE_INACTIVE" },
      403,
    );
  let query = identity.admin
    .from("cms_document_assets")
    .select(
      "id,storage_path,kind,title,revision,language,visibility,sha256,rights_confirmed,byte_size,created_at,archived_at,lock_version,source_kind,source_reference",
      { count: "exact" },
    )
    .eq("processing_status", "ready")
    .eq("scan_status", "clean")
    .order("created_at", { ascending: false })
    .range(from, from + input.pageSize - 1);
  query = qaContext.isQaActor
    ? query.eq("source_kind", "synthetic_test").eq("source_reference", qaContext.runTag)
    : query.neq("source_kind", "synthetic_test");
  if (!input.includeArchived) query = query.is("archived_at", null);
  const normalized = input.query.replace(/[%_,()]/g, "").trim();
  if (normalized) query = query.ilike("title", `%${normalized}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return json(req, {
    items: (data ?? []).map((row) => ({
      document: documentContract(row as DocumentRow),
      byteSize: row.byte_size,
      createdAt: row.created_at,
      archived: Boolean(row.archived_at),
      lockVersion: row.lock_version,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total: count ?? 0,
  });
}

async function transitionDocument(
  req: Request,
  identity: Identity,
  input: Extract<z.infer<typeof Input>, { action: "archive_document" | "restore_document" }>,
  key: string,
  correlationId: string,
  environment: "local" | "staging" | "production",
) {
  if (identity.claims.aal !== "aal2")
    return json(
      req,
      { error: "Confirme o MFA antes de administrar documentos.", code: "CMS_DOCUMENT_MFA_REQUIRED" },
      403,
    );
  if (!(await authorized(identity, "cms:documents.manage")))
    return json(
      req,
      { error: "Permissão insuficiente para administrar documentos.", code: "CMS_DOCUMENT_FORBIDDEN" },
      403,
    );
  const scoped = await identity.admin
    .from("cms_document_assets")
    .select("source_kind,source_reference")
    .eq("id", input.documentId)
    .single();
  if (scoped.error || !scoped.data) return json(req, { error: "Documento não encontrado." }, 404);
  const qaContext = await qaActorContext(identity, environment);
  if (!actorCanAccessDocument(qaContext, scoped.data))
    return json(
      req,
      { error: "O documento não pertence ao escopo deste ator.", code: "CMS_DOCUMENT_ACTOR_SCOPE_FORBIDDEN" },
      403,
    );
  const requestHash = await sha256(
    JSON.stringify({
      action: input.action,
      documentId: input.documentId,
      expectedLockVersion: input.expectedLockVersion,
    }),
  );
  const { data, error } = await identity.admin.rpc("cms_transition_document_asset", {
    p_actor_id: identity.user.id,
    p_document_id: input.documentId,
    p_action: input.action,
    p_expected_lock_version: input.expectedLockVersion,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_idempotency_key: key,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (error) throw error;
  return json(req, data, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);
  let raw: unknown;
  try {
    raw = await readJsonLimited(req, 64 * 1024);
  } catch {
    return json(req, { error: "Pedido de documento inválido." }, 400);
  }
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return json(req, { error: "Pedido de documento inválido." }, 400);
  try {
    const { environment, siteKey } = parsed.data.envelope.actorContext;
    const correlationId = parsed.data.envelope.correlationId;
    if (environment === "production" && !isProductionOperationEnabled(environment))
      return json(
        req,
        { error: "Produção indisponível nesta fase.", code: "CMS_DOCUMENT_PRODUCTION_GATED", correlationId },
        403,
      );
    const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
    if (!isConfiguredCmsEnvironment(configuredEnvironment))
      return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
    if (configuredEnvironment !== environment || siteKey !== "main")
      return json(
        req,
        { error: "Escopo não autorizado.", code: "CMS_DOCUMENT_SCOPE_MISMATCH", correlationId },
        403,
      );
    const occurredAt = Date.parse(parsed.data.envelope.occurredAt);
    if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
      return json(
        req,
        { error: "Comando expirado ou futuro.", code: "CMS_DOCUMENT_COMMAND_STALE", correlationId },
        409,
      );
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_documents_${parsed.data.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      parsed.data.action === "list" ? 120 : 30,
      900,
    );
    if (!allowed)
      return json(
        req,
        { error: "Muitas operações. Aguarde.", code: "CMS_DOCUMENT_RATE_LIMITED", correlationId },
        429,
      );
    if (parsed.data.action === "list") return listDocuments(req, identity, parsed.data);
    if (parsed.data.action === "list_security_review")
      return listSecurityReview(req, identity, parsed.data);
    const key = idempotencyKey(req);
    if (!key || key !== parsed.data.envelope.commandId)
      return json(
        req,
        { error: "A confirmação de segurança da operação é inválida." },
        400,
      );
    if (parsed.data.action === "reserve_upload")
      return reserveUpload(req, identity, parsed.data.metadata, environment, key, correlationId);
    if (parsed.data.action === "finalize_upload")
      return finalizeUpload(req, identity, parsed.data.documentId, key, correlationId, environment);
    if (parsed.data.action === "review_download")
      return reviewDownload(req, identity, parsed.data.documentId, correlationId, environment);
    if (parsed.data.action === "review_security")
      return reviewSecurity(req, identity, parsed.data, key, correlationId);
    if (parsed.data.action === "neutralize_synthetic")
      return neutralizeSynthetic(
        req,
        identity,
        parsed.data.documentId,
        environment,
        key,
        correlationId,
      );
    return transitionDocument(req, identity, parsed.data, key, correlationId, environment);
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? "");
    const segregation = message.includes("REVIEW_SEGREGATION_REQUIRED");
    const forbidden =
      message.includes("FORBIDDEN") ||
      message.includes("MFA_REQUIRED") ||
      message.includes("QA_ATTESTATION_INVALID") ||
      message.includes("ACTOR_SCOPE_FORBIDDEN") ||
      message.includes("SYNTHETIC_SCOPE_INVALID") ||
      message.includes("NEUTRALIZE_FORBIDDEN") ||
      message.includes("NEUTRALIZE_SYNTHETIC_SCOPE_REQUIRED");
    const publishedReference = message.includes("PUBLISHED_REFERENCE_EXISTS");
    const conflict =
      message.includes("IDEMPOTENCY") ||
      message.includes("FINALIZATION") ||
      message.includes("DUPLICATE") ||
      message.includes("LOCK_CONFLICT") ||
      message.includes("ALREADY_ARCHIVED") ||
      message.includes("NOT_ARCHIVED") ||
      message.includes("TRANSITION_INVALID") ||
      message.includes("REVIEW_SHA_MISMATCH") ||
      message.includes("REVIEW_CLOSED") ||
      message.includes("NEUTRALIZE_CONFIRMATION_INVALID") ||
      segregation ||
      publishedReference;
    const notFound = message.includes("NOT_FOUND");
    // Uma chamada de saida que estourou o prazo tem causa conhecida e precisa chegar ao operador
    // com ela, senao vira um 500 sem diagnostico e a investigacao recomeca do zero.
    if (isEdgeFetchTimeout(error))
      return json(
        req,
        {
          error: "Um servico de apoio nao respondeu no prazo. Repita a operacao.",
          code: "CMS_EDGE_UPSTREAM_TIMEOUT",
          upstream: message.slice("CMS_EDGE_FETCH_TIMEOUT:".length, 200),
          correlationId: parsed.data.envelope.correlationId,
        },
        504,
      );
    return json(
      req,
      {
        error: forbidden
          ? "Permissão insuficiente ou MFA ausente."
          : segregation
            ? "A revisão de segurança exige um segundo ator diferente do autor do upload."
          : publishedReference
            ? "Despublique o conteúdo que usa este documento antes de arquivá-lo."
            : conflict
              ? "A operação conflita com o estado atual do documento."
              : notFound
                ? "Documento não encontrado."
                : "Não foi possível concluir a operação de documento.",
        ...(publishedReference ? { code: "CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS" } : {}),
      },
      forbidden ? 403 : conflict ? 409 : notFound ? 404 : 500,
    );
  }
});
