import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CmsProductContentSchema } from "@/shared/contracts/cms-content";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

describe("governed CMS documents", () => {
  it("returns a document record accepted directly by the product contract", () => {
    const payload = comprehensiveProductPayload();
    payload.documents = [
      {
        id: "57000000-0000-4000-8000-000000000001",
        kind: "manual",
        title: "Manual PDF governado",
        storagePath: "cms-documents/57000000-0000-4000-8000-000000000001/manual.pdf",
        sha256: "a".repeat(64),
        revision: "1",
        language: "pt-BR",
        visibility: "public",
        rightsConfirmed: true,
      },
    ];
    expect(CmsProductContentSchema.safeParse(payload).success).toBe(true);
  });

  it("enforces private storage, MFA, PDF inspection and revocable public delivery", () => {
    const migration = readFileSync("supabase/migrations/0057_cms_governed_documents.sql", "utf8");
    const attestation = readFileSync(
      "supabase/migrations/0063_cms_document_security_attestation.sql",
      "utf8",
    );
    const edge = readFileSync("supabase/functions/cms-documents/index.ts", "utf8");
    const validator = readFileSync("supabase/functions/_shared/cms-pdf-validation.ts", "utf8");
    const resolver = readFileSync("supabase/functions/_shared/cms-document-resolution.ts", "utf8");
    const removal = readFileSync("supabase/functions/_shared/cms-storage-removal.ts", "utf8");
    const worker = readFileSync("supabase/functions/cms-outbox-worker/index.ts", "utf8");
    const publicApi = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
    const preview = readFileSync("supabase/functions/cms-preview/index.ts", "utf8");
    const browserCycle = readFileSync("tests/e2e/cms-secondary-ui-cycles.spec.ts", "utf8");
    expect(migration).toMatch(/'cms-documents-private', 'cms-documents-private', false, 20971520/);
    expect(migration).toMatch(/'cms:documents\.upload'.*true/s);
    expect(migration).toMatch(/'cms:documents\.security_review'.*true/s);
    expect(migration).toMatch(/processing_status = 'quarantined', scan_status = 'pending'/);
    expect(migration).toMatch(/legacy-unverified-import-v1/);
    expect(migration).not.toMatch(/legacy-editorial-record/);
    expect(attestation).toMatch(/CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED/);
    expect(attestation).toMatch(/p_expected_sha256/);
    expect(attestation).toMatch(/cms_document_security_reviews/);
    expect(attestation).toMatch(/private\.cms_qa_actor_marker_is_exact/);
    expect(attestation).toMatch(/cms_document_qa_attestation_allowed/);
    expect(attestation).toMatch(/cms_prepare_synthetic_document_neutralization/);
    expect(attestation).toMatch(/cms_confirm_synthetic_document_removal/);
    expect(attestation).toMatch(/cms_fixture_neutralize_synthetic_document/);
    expect(attestation).toMatch(/p_blob_removed is null/);
    expect(attestation).toMatch(/CMS_DOCUMENT_FIXTURE_REMOVAL_NOT_PREPARED/);
    expect(attestation).toMatch(/cms_list_pending_document_blob_cleanup/);
    expect(attestation).toMatch(/cms_confirm_document_blob_removal/);
    expect(attestation).toMatch(/cms_record_document_blob_cleanup_failure/);
    expect(attestation).toMatch(/cms_validate_synthetic_document_scope/);
    expect(attestation).toMatch(/cms_document_actor_scope_context/);
    expect(attestation).toMatch(/cms_validate_preview_document_scope/);
    expect(attestation).toMatch(/cms_validate_preview_media_scope/);
    expect(attestation).toMatch(/cms_product_document_reference_shape_allowed/);
    expect(attestation).toMatch(/where lease\.actor_id = p_actor_id\s+for share/);
    expect(attestation).toMatch(/limit 1\s+for share/);
    expect(attestation).toMatch(
      /where lease\.actor_id in \(v_item_creator, v_revision_creator\)[\s\S]*for share/,
    );
    expect(attestation).toMatch(/cms_official_https_url_allowed/);
    expect(attestation).toMatch(/'cms:documents\.read'/);
    expect(attestation).toMatch(/CMS_PREVIEW_DOCUMENT_SCOPE_INVALID/);
    expect(attestation).toMatch(/CMS_PREVIEW_ACTOR_SCOPE_INVALID/);
    expect(attestation).toMatch(/v_item_lease\.run_tag <> v_qa_lease\.run_tag/);
    expect(attestation).toMatch(/p_expires_at > least\(/);
    expect(attestation).toMatch(/lease\.candidate_sha = old\.candidate_sha/);
    expect(attestation).toMatch(/cms_claim_document_finalization/);
    expect(attestation).toMatch(/cms_document_canonical_write_fence/);
    expect(attestation).toMatch(/canonical_write_claim_expires_at/);
    expect(attestation).toMatch(/canonical_cleanup_not_before/);
    expect(attestation).toMatch(/interval '30 minutes'/);
    expect(attestation).toMatch(/canonical_cleanup_verify_until/);
    expect(attestation).toMatch(/Deadline monotono/);
    expect(attestation).toMatch(/cms_mark_document_upload_retired/);
    expect(attestation).toMatch(/cms_public_document_download_target/);
    expect(attestation).toMatch(/CMS_PRODUCT_SYNTHETIC_DOCUMENT_SCOPE_INVALID/);
    expect(migration).toMatch(/blob_disposition in \('available', 'access_revoked', 'removed'\)/);
    expect(migration).toMatch(/primary key \(item_id, id\)/);
    expect(migration).toMatch(/cms-document-uploads/);
    expect(migration).toMatch(/processing_status in \('awaiting_upload', 'finalizing'/);
    expect(migration).not.toMatch(/grant select on public\.cms_document_assets to authenticated/);
    expect(migration).not.toMatch(/cms_documents_authorized_read/);
    expect(migration).toMatch(/CMS_PRODUCT_DOCUMENT_ASSET_INVALID/);
    expect(migration).toMatch(
      /duplicate\.archived_at is null\s+and private\.cms_document_actor_scope_allowed\(/,
    );
    expect(
      migration.match(/duplicate\.archived_at is null\s+and private\.cms_document_actor_scope_allowed\(/g),
    ).toHaveLength(2);
    expect(migration).toMatch(/CMS_DOCUMENT_PUBLISHED_REFERENCE_EXISTS/);
    expect(migration).toMatch(/lock_version = lock_version \+ 1/);
    expect(edge).toMatch(/validatePassivePdf/);
    expect(edge).toMatch(/originalFilename:.*regex\(\/\\\.pdf\$\/i\)/);
    expect(edge).toMatch(/archive_document/);
    expect(edge).toMatch(/restore_document/);
    expect(edge).toMatch(/expectedLockVersion/);
    expect(validator).toMatch(/%PDF-1/);
    expect(validator).toMatch(/JavaScript\|JS\|Launch\|OpenAction/);
    expect(edge).toMatch(/sha256Bytes/);
    expect(edge).toMatch(/currentSha256 !== input\.expectedSha256/);
    expect(edge).toMatch(/CMS_DOCUMENT_REVIEW_BYTES_CHANGED/);
    expect(edge).toMatch(/neutralize_synthetic/);
    expect(edge).toMatch(/CMS_DOCUMENT_BLOB_REMOVAL_PENDING/);
    expect(edge).toMatch(/removeAndVerifyStorageObject/);
    expect(edge).toMatch(/retireSignedUploadObject/);
    expect(edge).toMatch(/ensureCanonicalStorageObject/);
    expect(edge).toMatch(/duplicateInActorScope/);
    expect(edge).toMatch(/duplicateCandidates[\s\S]*\.find\(\(candidate\) =>/);
    expect(edge).toMatch(/isDuplicateRace/);
    expect(edge).toMatch(/createSignedUploadUrl\(reserved\.document\.uploadPath, \{ upsert: false \}\)/);
    expect(edge).toMatch(/review_download/);
    expect(edge).toMatch(
      /createSignedUrl\(asset\.storage_path, 300, \{ download: asset\.original_filename \}\)/,
    );
    expect(edge).toMatch(/consumeRateLimit/);
    expect(resolver).toMatch(/matchesGovernedAsset/);
    expect(resolver).toMatch(/synthetic_expires_at/);
    expect(resolver).toMatch(/typeof destination === "number"/);
    expect(resolver).toMatch(/createSignedUrls\(paths, destination, \{ download: true \}\)/);
    expect(resolver).toContain('destination: "validated" | number');
    expect(resolver).not.toContain("documentId:");
    expect(resolver).not.toContain("sha256: String(document.sha256)");
    expect(publicApi).toContain('if (type === "document")');
    expect(publicApi).toContain('url.searchParams.get("position")');
    expect(removal).toMatch(/\.list\(prefix, \{ limit: 100, search: filename \}\)/);
    expect(removal).toMatch(/SIGNED_UPLOAD_GUARD_BYTES/);
    expect(removal).toMatch(/upsert: true/);
    expect(worker).toMatch(/reconcileDocumentBlobs/);
    expect(worker).toMatch(/cms_complete_qa_actor_lease/);
    expect(publicApi).toMatch(/resolveDocumentAssets/);
    expect(publicApi).not.toMatch(/omitUnresolvedGovernedDocuments\(payload/);
    expect(publicApi).toMatch(/Keep the sanitized source order until presentPublicPayload filters/);
    expect(publicApi).toMatch(/cms_public_document_download_target/);
    expect(publicApi).toMatch(/"Cache-Control": "private, no-store"/);
    expect(publicApi).toMatch(/"X-Robots-Tag": "noindex, nofollow, noarchive"/);
    expect(preview).toMatch(/resolveDocumentAssets/);
    expect(preview).toMatch(/const assetTtlSeconds = Math\.min\(60, remainingSeconds\)/);
    expect(preview).not.toMatch(/resolveDocumentAssets\(admin, documents, 1800\)/);
    expect(browserCycle).toMatch(/"X-Idempotency-Key": commandId/);
    expect(browserCycle).not.toMatch(/"Idempotency-Key": commandId/);
  });
});
