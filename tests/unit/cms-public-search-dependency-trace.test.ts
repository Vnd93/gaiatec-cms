import { describe, expect, it, vi } from "vitest";
import { observeSearchDependency } from "../../supabase/functions/cms-public/search-dependency-trace";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const req = (type = "search") =>
  new Request(`https://example.invalid/?type=${type}&q=private-query`, {
    headers: { "x-cms-document-trace": trace, authorization: "private-credential" },
  });

describe("staging search dependency diagnostics", () => {
  it("preserves the rate-limit decision with exactly one invocation", async () => {
    const operation = vi.fn().mockResolvedValue(false);
    const log = vi.fn();
    expect(await observeSearchDependency(req(), "staging", release, "rate-limit", operation, log)).toBe(
      false,
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[1][0]).toMatchObject({
      trace,
      release,
      lookup: "search",
      stage: "rate-limit",
      outcome: "settled",
      resultKind: "success",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|authorization|example.invalid/);
  });
  it.each([
    [0, "transport_error"],
    [500, "query_error"],
  ])("classifies a failed SDK envelope at status %s without exposing it", async (status, resultKind) => {
    const result = {
      data: null,
      status,
      error: { message: "private-database-error", details: "private-row" },
    };
    const operation = vi.fn().mockResolvedValue(result);
    const log = vi.fn();
    expect(
      await observeSearchDependency(req("autocomplete"), "staging", release, "synonyms", operation, log),
    ).toBe(result);
    expect(log.mock.calls[1][0]).toMatchObject({ stage: "synonyms", resultKind });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
  });
  it.each([
    ["CMS_EDGE_FETCH_TIMEOUT:POST:/rest/v1/rpc/consume_rate_limit:900", "upstream_timeout"],
    ["private-error", "operation_error"],
  ])("rethrows the original failure without retry or disclosure", async (message, resultKind) => {
    const error = new Error(message);
    const operation = vi.fn().mockRejectedValue(error);
    const log = vi.fn();
    await expect(
      observeSearchDependency(req(), "staging", release, "rate-limit", operation, log),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[1][0]).toMatchObject({ outcome: "rejected", resultKind });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|consume_rate_limit|CMS_EDGE_FETCH_TIMEOUT/);
  });
  it.each(["production", "local", undefined])("does not observe %s", async (environment) => {
    const log = vi.fn();
    expect(
      await observeSearchDependency(req(), environment, release, "synonyms", () => Promise.resolve(1), log),
    ).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });
  it("does not observe non-search operations or unbound requests", async () => {
    const log = vi.fn();
    for (const [request, sha] of [
      [req("products"), release],
      [req(), "invalid"],
      [new Request("https://example.invalid/?type=search"), release],
    ] as const) {
      expect(
        await observeSearchDependency(
          request,
          "staging",
          sha,
          "rate-limit",
          () => Promise.resolve(true),
          log,
        ),
      ).toBe(true);
    }
    expect(log).not.toHaveBeenCalled();
  });
});
