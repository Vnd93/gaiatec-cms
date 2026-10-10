import { describe, expect, it } from "vitest";
import { formReadDiagnostic } from "../../supabase/functions/cms-public/form-read-diagnostic";

const trace = "01234567-89ab-4cde-8fab-0123456789ab.1";
const release = "a".repeat(40);
const req = new Request("https://example.invalid/?type=form&key=never-log", {
  headers: { "x-cms-document-trace": trace },
});

describe("staging public form failure diagnosis", () => {
  it("distinguishes transport timeout, structured upstream error and invalid contract", () => {
    expect(
      formReadDiagnostic(req, "staging", release, { message: "CMS_EDGE_FETCH_TIMEOUT:GET:900" })?.reason,
    ).toBe("upstream_timeout");
    expect(formReadDiagnostic(req, "staging", release, { code: "42501" })).toMatchObject({
      reason: "upstream_code",
      code: "42501",
    });
    expect(formReadDiagnostic(req, "staging", release)?.reason).toBe("invalid_contract");
  });
  it("never records arbitrary error content, identifiers, URL or selectors", () => {
    expect(
      formReadDiagnostic(req, "staging", release, {
        code: "sensitive-data",
        message: "private-value",
        details: "never-log",
      }),
    ).toEqual({
      event: "cms.public.form.read_failed",
      trace,
      release,
      lookup: "form",
      reason: "upstream_error",
    });
  });
  it.each(["production", "local", undefined])("does not emit in %s", (environment) => {
    expect(formReadDiagnostic(req, environment, release, { code: "42501" })).toBeNull();
  });
  it("requires exact release, bounded trace and form GET", () => {
    expect(formReadDiagnostic(req, "staging", "unknown")).toBeNull();
    expect(
      formReadDiagnostic(new Request("https://example.invalid/?type=form"), "staging", release),
    ).toBeNull();
    expect(
      formReadDiagnostic(
        new Request("https://example.invalid/?type=form", {
          method: "POST",
          headers: { "x-cms-document-trace": trace },
        }),
        "staging",
        release,
      ),
    ).toBeNull();
  });
});
