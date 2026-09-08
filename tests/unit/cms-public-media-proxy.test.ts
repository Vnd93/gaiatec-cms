import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { governedSignedMediaIdentity } from "../../supabase/functions/_shared/cms-public-media-proxy";

const service = "https://project-ref.supabase.co";

describe("revocable public media proxy", () => {
  it("accepts only a signed URL from the configured private media bucket", () => {
    expect(
      governedSignedMediaIdentity(
        `${service}/storage/v1/object/sign/cms-media-private/transforms/image.webp?token=signed-token`,
        service,
      ),
    ).toBe(`${service}/storage/v1/object/sign/cms-media-private/transforms/image.webp`);

    for (const source of [
      "https://evil.example/storage/v1/object/sign/cms-media-private/image.webp?token=signed-token",
      `${service}/storage/v1/object/public/cms-media-private/image.webp`,
      `${service}/storage/v1/object/sign/other-bucket/image.webp?token=signed-token`,
      `${service}/storage/v1/object/sign/cms-media-private/image.webp?token=signed-token&redirect=https://evil.example`,
      `http://project-ref.supabase.co/storage/v1/object/sign/cms-media-private/image.webp?token=signed-token`,
    ])
      expect(governedSignedMediaIdentity(source, service), source).toBeNull();
  });

  it("revalidates the projection and governed media after reading the bytes", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/cms-public/index.ts"), "utf8");
    const mediaHandler = source.slice(
      source.indexOf('if (type === "media")'),
      source.indexOf('if (type === "document")'),
    );
    const readBytes = mediaHandler.indexOf("await upstream.arrayBuffer()");
    const reloadedProjection = mediaHandler.indexOf("await loadPublicResource()", readBytes);
    const reauthorizedMedia = mediaHandler.indexOf("await resolveCurrentMediaSource()", reloadedProjection);

    expect(readBytes).toBeGreaterThan(-1);
    expect(reloadedProjection).toBeGreaterThan(readBytes);
    expect(reauthorizedMedia).toBeGreaterThan(reloadedProjection);
    expect(mediaHandler).toContain("confirmedAssetId !== assetId");
    expect(mediaHandler).toContain("!== sourceIdentity");
    expect(mediaHandler).toContain('fetch(source, { redirect: "error" })');
  });
});
