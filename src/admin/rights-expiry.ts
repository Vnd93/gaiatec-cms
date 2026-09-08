const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zoneOffsetMs(timestamp: number, timeZone: string) {
  const rounded = Math.trunc(timestamp / 1_000) * 1_000;
  const parts = zonedParts(rounded, timeZone);
  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) - rounded
  );
}

export function operationalDateFromInstant(
  value: string | null | undefined,
  timeZone = "America/Sao_Paulo",
): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Data de vigência inválida.");
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function rightsExpiryAtOperationalDayEnd(
  dateOnly: string,
  timeZone = "America/Sao_Paulo",
): string | null {
  if (!dateOnly) return null;
  const match = DATE_ONLY.exec(dateOnly);
  if (!match) throw new Error("Data de vigência inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localWallClock = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  let instant = localWallClock - zoneOffsetMs(localWallClock, timeZone);
  instant = localWallClock - zoneOffsetMs(instant, timeZone);
  const resolved = zonedParts(instant, timeZone);
  if (
    resolved.year !== match[1] ||
    resolved.month !== match[2] ||
    resolved.day !== match[3] ||
    resolved.hour !== "23" ||
    resolved.minute !== "59" ||
    resolved.second !== "59"
  ) {
    throw new Error("A data não possui um fim de dia válido no fuso operacional.");
  }
  return new Date(instant).toISOString();
}
