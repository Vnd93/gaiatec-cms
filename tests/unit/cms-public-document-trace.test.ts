import { describe, expect, it } from "vitest";
import { documentTrace } from "../../supabase/functions/cms-public/document-trace";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const request = (value = trace, type = "page-by-path", method = "GET") =>
  new Request(`https://example.invalid/?type=${type}`, {
    method,
    headers: { "x-cms-document-trace": value },
  });

describe("staging document trace boundary", () => {
  it("correlates both bounded attempts and exact backend release", () => {
    expect(documentTrace(request(), "staging", release)).toEqual({ trace, release, lookup: "page-by-path" });
    expect(documentTrace(request(trace.replace(/1$/, "2")), "staging", release)?.trace).toMatch(/\.2$/);
  });
  it.each([
    "entity-detail",
    "detail",
    "redirect",
    "form",
    "post-detail",
    "campaign-by-path",
    "products",
    "search",
    "autocomplete",
  ])("correlates only allowlisted metadata: %s", (lookup) => {
    expect(documentTrace(request(trace, lookup), "staging", release)?.lookup).toBe(lookup);
  });
  it.each(["production", "local", undefined])("never logs traces in %s", (environment) => {
    expect(documentTrace(request(), environment, release)).toBeNull();
  });
  it.each(["private?email=never-record", trace.replace(/1$/, "3"), "", trace + "\nextra"])(
    "rejects malformed traces",
    (value) => {
      // Newline is rejected by Headers itself; the helper must never see arbitrary multiline input.
      if (value.includes("\n")) expect(() => request(value)).toThrow();
      else expect(documentTrace(request(value), "staging", release)).toBeNull();
    },
  );
  it("excludes other operations, non-GET and unbound releases", () => {
    expect(documentTrace(request(trace, "unknown"), "staging", release)).toBeNull();
    expect(documentTrace(request(trace, "page-by-path", "POST"), "staging", release)).toBeNull();
    expect(documentTrace(request(), "staging", "local")).toBeNull();
  });
});
