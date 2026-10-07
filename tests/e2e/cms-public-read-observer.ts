import type { Request, Response } from "@playwright/test";

type Read = {
  request: Request;
  started: number;
  responseOrder?: number;
  status?: number;
  finished?: number;
  failedOrder?: number;
  failedAt?: number;
  error?: string;
  group: Read[];
};

/** One instance per page; no URL, key, response body or identifier is persisted in evidence. */
export function createPublicReadObserver(trackedOrigins: ReadonlySet<string>) {
  const reads = new Map<Request, Read>();
  const openGroups = new Map<string, Read[]>();
  let order = 0;

  function onRequest(request: Request) {
    if (request.method() !== "GET" || request.resourceType() !== "fetch") return;
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (
      !trackedOrigins.has(url.origin) ||
      url.pathname !== "/functions/v1/cms-public" ||
      !["page-by-path", "entity-detail"].includes(url.searchParams.get("type") ?? "")
    )
      return;
    const headers = request.headers();
    if (!headers.apikey || headers.authorization !== undefined) return;
    const key = `${url.href}\n${headers.apikey}`;
    const previous = openGroups.get(key);
    const now = Date.now();
    // A later navigation/read cannot borrow a historical success. Both transports must overlap
    // before ANY response or failure, and fit the runtime helper's original ten-second deadline.
    const group =
      previous &&
      previous.every(
        (read) =>
          read.responseOrder === undefined &&
          read.failedOrder === undefined &&
          read.finished === undefined &&
          now - read.started < 10_000,
      )
        ? previous
        : [];
    const read: Read = { request, started: now, group };
    group.push(read);
    openGroups.set(key, group);
    reads.set(request, read);
  }

  function onResponse(response: Response) {
    const read = reads.get(response.request());
    if (!read) return;
    read.responseOrder = ++order;
    read.status = response.status();
  }

  function onRequestFinished(request: Request) {
    const read = reads.get(request);
    if (read) read.finished = Date.now();
  }

  function onRequestFailed(request: Request) {
    const read = reads.get(request);
    if (!read) return;
    read.failedOrder = ++order;
    read.failedAt = Date.now();
    read.error = request.failure()?.errorText;
  }

  function isProvenRedundantCancellation(request: Request) {
    const read = reads.get(request);
    if (
      !read ||
      read.group.length !== 2 ||
      read.error !== "net::ERR_ABORTED" ||
      read.responseOrder !== undefined ||
      read.finished !== undefined ||
      read.failedOrder === undefined
    )
      return false;
    const winner = read.group.find((entry) => entry !== read)!;
    const deadline = Math.min(read.started, winner.started) + 10_000;
    return (
      winner.status === 200 &&
      winner.responseOrder !== undefined &&
      winner.responseOrder < read.failedOrder &&
      winner.failedOrder === undefined &&
      winner.finished !== undefined &&
      winner.finished <= deadline &&
      read.failedAt !== undefined &&
      read.failedAt <= deadline
    );
  }

  return { onRequest, onResponse, onRequestFinished, onRequestFailed, isProvenRedundantCancellation };
}
