const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r\n]/;

function stringifyCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Serializes a CSV cell while preventing spreadsheet applications from
 * interpreting untrusted lead or audit data as a formula.
 */
export function serializeCsvCell(value: unknown): string {
  const raw = stringifyCsvValue(value);
  const safe = SPREADSHEET_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(serializeCsvCell).join(",")).join("\r\n");
}
