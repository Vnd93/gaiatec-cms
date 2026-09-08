import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");

describe("CMS media upload hardening", () => {
  it("inspects every raster format and bounds decode before browser codecs", async () => {
    const [metadata, responsive, fingerprint, avifWorker, upload] = await Promise.all([
      read("src/shared/raster-image-metadata.ts"),
      read("src/admin/responsive-media.ts"),
      read("src/admin/dam-model.ts"),
      read("src/admin/avif-encoder.worker.ts"),
      read("src/admin/media-upload-model.ts"),
    ]);

    for (const marker of ["parsePng", "parseJpeg", "parseWebp", "parseAvif", "orientation"])
      expect(metadata).toContain(marker);
    expect(metadata).toContain("MAX_RASTER_PIXELS = 32_000_000");
    expect(metadata).toContain("MAX_RASTER_BYTES = 20 * 1024 * 1024");
    expect(metadata).toContain("encodedWidth");
    expect(metadata).toContain("containedRasterDimensions");

    const safePreview = responsive.slice(
      responsive.indexOf("export async function createSafeRasterPreview"),
      responsive.indexOf("export function responsiveVariantDimensions"),
    );
    expect(safePreview.indexOf("validateOriginalMediaFile(original)")).toBeLessThan(
      safePreview.indexOf("original.arrayBuffer()"),
    );
    expect(safePreview.indexOf("inspectRasterImage(bytes)")).toBeLessThan(
      safePreview.indexOf("createImageBitmap(original"),
    );
    expect(safePreview).toContain("maximumEdge ?? 480");

    const generator = responsive.slice(
      responsive.indexOf("async function generateBrowserResponsiveVariants"),
      responsive.indexOf("export async function createResponsiveMediaPackage"),
    );
    expect(generator.indexOf("inspectRasterImage(bytes)")).toBeLessThan(
      generator.indexOf("createImageBitmap(original"),
    );
    expect(generator).toContain("resizeWidth: decodeDimensions.width");
    expect(generator).toContain('imageOrientation: "none"');
    expect(responsive).toContain('new URL("./avif-encoder.worker.ts", import.meta.url)');
    expect(responsive).toContain("this.worker.terminate()");
    expect(avifWorker).toContain("Number(request.width) <= 1_600");
    expect(avifWorker).toContain("Number(request.width) * Number(request.height) <= 2_560_000");

    const fingerprintFlow = fingerprint.slice(
      fingerprint.indexOf("export async function fingerprintMediaFile"),
    );
    expect(fingerprintFlow.indexOf("file.size > MAX_RASTER_BYTES")).toBeLessThan(
      fingerprintFlow.indexOf("file.arrayBuffer()"),
    );
    expect(fingerprintFlow.indexOf("inspectRasterImage(bytes)")).toBeLessThan(
      fingerprintFlow.indexOf("perceptualDHash(file)"),
    );
    expect(fingerprint).toContain("createImageBitmap(file");
    expect(upload).toContain("signal?: AbortSignal");
    expect(upload).toContain("timeoutMs?: number");
    expect(upload).toContain("controller.abort");
  });

  it("keeps WebAssembly capability on only the dedicated worker response", async () => {
    const [cloudflare, readiness, canary] = await Promise.all([
      read("cloudflare/_worker.js"),
      read("scripts/ev2/phase16/phase16-readiness.test.mjs"),
      read("scripts/ev2/phase16/csp-browser-canary.mjs"),
    ]);
    const documentPolicy = cloudflare.slice(
      cloudflare.indexOf("const CONTENT_SECURITY_POLICY"),
      cloudflare.indexOf("const AVIF_ENCODER_WORKER_PATH"),
    );
    const workerPolicy = cloudflare.slice(
      cloudflare.indexOf("const AVIF_ENCODER_WORKER_CONTENT_SECURITY_POLICY"),
      cloudflare.indexOf("export function contentSecurityPolicy"),
    );
    expect(documentPolicy).not.toContain("wasm-unsafe-eval");
    expect(documentPolicy).not.toContain("unsafe-eval");
    expect(workerPolicy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(workerPolicy).toContain("default-src 'none'");
    expect(readiness).toContain('contentSecurityPolicy("/admin")');
    expect(readiness).toMatch(/doesNotMatch\(adminPolicy, \/wasm-unsafe-eval\|unsafe-eval\//);
    expect(canary).toContain("new Worker(workerPath");
    expect(canary).toContain("The dedicated AVIF worker does not have its exact isolated CSP");
  });

  it("makes compensation, retention, usage impact and physical cleanup server-authoritative", async () => {
    const [migration, edge, outbox, removal, contract] = await Promise.all([
      read("supabase/migrations/0082_cms_media_upload_abort.sql"),
      read("supabase/functions/cms-media/index.ts"),
      read("supabase/functions/cms-outbox-worker/index.ts"),
      read("supabase/functions/_shared/cms-storage-removal.ts"),
      read("src/shared/contracts/ev2-dam.ts"),
    ]);

    for (const marker of [
      "CMS_MEDIA_OPERATIONAL_PIXEL_PREFLIGHT_FAILED",
      "validate constraint cms_media_operational_pixel_limit",
      "upload_token_expires_at",
      "cms_abort_dam_upload",
      "cms_watchdog_stale_dam_uploads",
      "cms_claim_incomplete_media_gc",
      "cms_finish_incomplete_media_gc",
      "verificationNonce",
      "firstAbsenceVerifiedAt",
      "resweepRequired",
      "incomplete_upload",
      "retained_archive",
      "cms_restore_legacy_media",
      "cms_count_media_usages_scoped",
      "CMS_DAM_GC_ASSET_FENCED",
      "CMS_DAM_CROP_ASPECT_INVALID",
    ])
      expect(migration).toContain(marker);
    expect(migration).toMatch(
      /revoke all on function public\.cms_claim_incomplete_media_gc\(integer,uuid\)[\s\S]+to service_role/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.cms_finish_incomplete_media_gc\([\s\S]+to service_role/,
    );
    expect(migration).toContain("for update of job, asset skip locked");
    expect(migration).toContain("extensions.digest");

    const handleV2 = edge.slice(
      edge.indexOf("async function handleV2"),
      edge.indexOf("async function finalizeAsset"),
    );
    expect(handleV2.indexOf('command.action === "abort_upload"')).toBeLessThan(
      handleV2.indexOf('p_flag_key: "ev2.dam"'),
    );
    expect(edge).toContain('rpc("cms_archive_legacy_media"');
    expect(edge).toContain('rpc("cms_restore_legacy_media"');
    expect(edge).toContain('rpc("cms_count_media_usages_scoped"');
    expect(edge).toContain("removeAndVerifyMediaStorageObject(identity.admin, path)");
    expect(edge).toContain("publishableSourceIds");
    expect(edge).toContain("isDamResolvedAssetPublishable");
    const matchAsset = edge.slice(
      edge.indexOf('command.action === "match_asset"'),
      edge.indexOf('command.action === "preview_replacement"'),
    );
    expect(matchAsset.match(/publishableSourceIds/g)).toHaveLength(2);
    expect(edge).toContain("map((sourceId) => targetBySource.get(sourceId) ?? sourceId)");
    expect(edge.indexOf("original.data.size > MAX_RASTER_BYTES")).toBeLessThan(
      edge.indexOf("original.data.arrayBuffer()"),
    );
    expect(edge).toContain("p_width: originalMetadata.width");
    expect(edge).toContain("p_height: originalMetadata.height");
    expect(edge).toContain("variantMetadata.width !== expected.width");
    expect(edge).toContain("source.totalUsageCount");
    expect(edge).toContain("hiddenUsageCount");
    expect(edge).toContain("const claimId = context?.commandId ?? assetId");
    expect(edge).toContain('reconciled.data?.status === "ready"');

    expect(outbox).toContain('rpc("cms_claim_incomplete_media_gc"');
    expect(outbox).toContain("removeAndVerifyMediaStorageObject");
    expect(outbox).toContain('rpc("cms_finish_incomplete_media_gc"');
    expect(outbox).toContain("verificationProof");
    expect(outbox).toContain('finish.data?.status === "pending"');
    expect(outbox).toContain("new Set(claim.paths).size !== claim.paths.length");
    expect(outbox).toContain('claim.disposition !== "retained_archive"');
    expect(outbox).not.toMatch(/JSON\.stringify\([^)]*paths/);
    expect(removal).toContain('from("cms-media-private")');
    expect(removal).toContain("isExactMediaStoragePath");
    expect(contract).toContain('action: z.literal("abort_upload")');
    expect(contract).toContain("Ev2DamIncomingReplacementSchema");
    expect(contract).toContain("totalUsageCount");
    expect(contract).toContain("hiddenUsageCount");
  });
});
