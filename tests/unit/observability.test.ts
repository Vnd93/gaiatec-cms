import { buildStructuredEvent, safeRoute, sanitizeContext } from "../../src/shared/observability";

describe("observability without PII", () => {
  it("removes query strings and fragments from routes", () => {
    expect(safeRoute("/contato?email=pessoa@example.com#form")).toBe("/contato");
  });

  it("redacts sensitive keys recursively", () => {
    expect(
      sanitizeContext({
        status: 503,
        email: "pessoa@example.com",
        nested: { token: "secret", operation: "publish" },
      }),
    ).toEqual({ status: 503, nested: { operation: "publish" } });
  });

  it("builds a versioned structured event", () => {
    const event = buildStructuredEvent("warn", "api request failed", { status: 503 }, crypto.randomUUID());
    expect(event).toMatchObject({
      level: "warn",
      event: "api_request_failed",
      route: "/",
      context: { status: 503 },
    });
    expect(event.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
