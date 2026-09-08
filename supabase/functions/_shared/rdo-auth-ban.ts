export type RdoAuthBanClassification = "none" | "legacy_rdo" | "global_restriction";

const LEGACY_RDO_BAN_HOURS = 876_000;
const LEGACY_RDO_BAN_MS = LEGACY_RDO_BAN_HOURS * 60 * 60 * 1_000;
const LEGACY_RDO_BAN_TOLERANCE_MS = 15 * 60 * 1_000;

function timestamp(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyRdoAuthBan(input: {
  bannedUntil: string | null | undefined;
  rdoActive: boolean | null | undefined;
  rdoSuspendedAt: string | null | undefined;
  rdoSuspendedBy: string | null | undefined;
  cmsProfileStatus: string | null | undefined;
  now?: number;
}): RdoAuthBanClassification {
  const now = input.now ?? Date.now();
  const bannedUntil = timestamp(input.bannedUntil);
  if (bannedUntil === null || bannedUntil <= now) return "none";

  // A suspensão CMS é uma restrição global independente. Nunca permita que
  // uma ação escopada ao RDO a remova.
  if (input.cmsProfileStatus === "suspended") return "global_restriction";

  // O ban legado só existia enquanto o acesso RDO estava suspenso. Exigir
  // explicitamente esse estado impede que um administrador RDO remova um ban
  // global posterior de uma identidade já reativada.
  if (input.rdoActive !== false) return "global_restriction";

  const suspendedAt = timestamp(input.rdoSuspendedAt);
  if (suspendedAt === null || !input.rdoSuspendedBy) return "global_restriction";
  const legacyDuration = bannedUntil - suspendedAt;
  return Math.abs(legacyDuration - LEGACY_RDO_BAN_MS) <= LEGACY_RDO_BAN_TOLERANCE_MS
    ? "legacy_rdo"
    : "global_restriction";
}
