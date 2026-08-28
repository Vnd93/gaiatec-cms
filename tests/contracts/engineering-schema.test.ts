import { EngineeringSignalSchema } from "../../src/shared/contracts/engineering";

describe("engineering signal contract v1", () => {
  const validSignal = {
    schemaVersion: 1,
    correlationId: "50cf8208-4be6-45dd-a246-a3aa134173d1",
    release: "0835046",
    route: "/produtos",
    signal: "api.request",
    outcome: "ok",
    durationMs: 42,
  };

  it("accepts the stable public envelope", () => {
    expect(EngineeringSignalSchema.parse(validSignal)).toEqual(validSignal);
  });

  it("rejects unknown fields and personal data", () => {
    expect(() => EngineeringSignalSchema.parse({ ...validSignal, email: "pessoa@example.com" })).toThrow();
  });

  it("rejects unknown versions", () => {
    expect(() => EngineeringSignalSchema.parse({ ...validSignal, schemaVersion: 2 })).toThrow();
  });
});
