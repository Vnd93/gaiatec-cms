import { isEdgeFetchTimeout } from "./cms-edge-fetch.ts";

type MediaSigningResult = {
  data: { error: string | null; path: string | null; signedUrl: string | null }[] | null;
  error: { message: string; status?: number } | null;
};

type MediaSigningBucket = {
  createSignedUrls(paths: string[], expiresIn: number): Promise<MediaSigningResult>;
};

export async function signMediaDownloadUrls(
  bucket: MediaSigningBucket,
  paths: string[],
  ttlSeconds: number,
  retryOnTimeout = false,
): Promise<MediaSigningResult> {
  const result = await bucket.createSignedUrls(paths, ttlSeconds);
  // Storage uses POST for this SELECT-only operation. Retry only the download-signing call,
  // not generic POSTs, uploads, RPCs or structured refusals. The caller's existing 900 ms
  // transport deadline remains authoritative; at most two signing attempts can run.
  if (
    retryOnTimeout &&
    result.error &&
    result.error.status === undefined &&
    isEdgeFetchTimeout(result.error)
  )
    return await bucket.createSignedUrls(paths, ttlSeconds);
  return result;
}
