import { describe, expect, it } from "vitest";
import { buildCsv, serializeCsvCell } from "@/admin/csv";

describe("exportação CSV administrativa", () => {
  it.each([
    "=1+1",
    "+SUM(A1:A2)",
    "-10+20",
    '@IMPORTDATA("https://example.test")',
    "\t=cmd",
    "\r=cmd",
    "\n=cmd",
  ])("neutraliza célula potencialmente executável %j", (value) => {
    expect(serializeCsvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
  });

  it("preserva texto comum, escapa aspas e serializa estruturas", () => {
    expect(serializeCsvCell('GAIATEC "CMS"')).toBe('"GAIATEC ""CMS"""');
    expect(serializeCsvCell({ source: "qa" })).toBe('"{""source"":""qa""}"');
    expect(serializeCsvCell(null)).toBe('""');
  });

  it("gera linhas CRLF compatíveis com planilhas", () => {
    expect(
      buildCsv([
        ["a", "b"],
        ["1", "=2+2"],
      ]),
    ).toBe('"a","b"\r\n"1","\'=2+2"');
  });
});
