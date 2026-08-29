import { describe, expect, it } from "vitest";
import { formatProductSpecification } from "../../src/public/format-product-spec";
const base = {
  id: "10000000-0000-4000-8000-000000000001",
  key: "teste",
  label: "Teste",
  required: true,
  filterable: true,
  comparable: true,
  searchable: true,
} as const;

describe("product specification formatter", () => {
  it("formats range, enum and boolean values for people", () => {
    expect(
      formatProductSpecification({ ...base, type: "range", value: { min: 0.3, max: 10 }, unit: "m/s" }),
    ).toBe("0.3–10 m/s");
    expect(formatProductSpecification({ ...base, type: "enum", value: ["IP65", "IP67", "IP68"] })).toBe(
      "IP65 · IP67 · IP68",
    );
    expect(formatProductSpecification({ ...base, type: "boolean", value: false })).toBe("Não");
  });
});
