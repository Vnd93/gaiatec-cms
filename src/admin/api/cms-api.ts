import type { Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export class CmsApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly correlationId?: string;
  readonly currentVersion?: number;
  readonly diffRef?: string;
  readonly preserved: boolean;

  constructor(
    message: string,
    status: number,
    details: {
      code?: string;
      correlationId?: string;
      currentVersion?: number;
      diffRef?: string;
      preserved?: boolean;
    },
  ) {
    super(message);
    this.name = "CmsApiError";
    this.status = status;
    this.code = details.code;
    this.correlationId = details.correlationId;
    this.currentVersion = details.currentVersion;
    this.diffRef = details.diffRef;
    this.preserved = details.preserved ?? false;
  }
}

async function invoke<T>(
  session: Session,
  fn: string,
  body: unknown,
  idempotent: boolean | string = false,
): Promise<T> {
  const response = await fetch(SUPABASE_URL + "/functions/v1/" + fn, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
      ...(idempotent
        ? { "X-Idempotency-Key": typeof idempotent === "string" ? idempotent : crypto.randomUUID() }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    correlationId?: string;
    currentVersion?: number;
    diffRef?: string;
    preserved?: boolean;
  };
  if (!response.ok) {
    throw new CmsApiError(data.error ?? "Falha na operação administrativa.", response.status, data);
  }
  return data;
}

export type EditorialResult = {
  itemId: string;
  status: string;
  lockVersion?: number;
  revisionId?: string;
  revisionNumber?: number;
  contentVersion?: number;
  etag?: string;
  correlationId: string;
};
export function editorialCommand(session: Session, body: Record<string, unknown>) {
  return invoke<EditorialResult>(session, "cms-content", body, true);
}

export function draftV2Command<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-drafts-v2", body, idempotencyKey ?? false);
}
export function issuePreview(session: Session, itemId: string, revisionId?: string) {
  return invoke<{ path: string; expiresAt: string; remainingUses?: number }>(session, "cms-preview", {
    itemId,
    revisionId: revisionId ?? null,
    maxUses: 20,
    minutes: 15,
  });
}
export function mediaCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-media", body);
}
export function damCommand<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-media", body, idempotencyKey ?? false);
}
export function searchGovernanceCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-search-admin", body, true);
}
export function qualityCommand<T>(session: Session, body: Record<string, unknown>, idempotent = false) {
  return invoke<T>(session, "cms-quality", body, idempotent);
}
export function releaseV2Command<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return invoke<T>(session, "cms-releases", body, idempotencyKey ?? false);
}
export function collaborationCommand<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return invoke<T>(session, "cms-collaboration", body, idempotencyKey ?? false);
}
export function bulkV2Command<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-bulk", body, idempotencyKey ?? false);
}
export function leadCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-leads", body, true);
}
export function bulkImportCommand<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey: string,
) {
  return invoke<T>(session, "cms-content", body, idempotencyKey);
}

export type ControlledVocabularyOption = {
  id: string;
  slug: string;
  label: string;
  description: string;
  public_visible: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
};
export type ControlledVocabularyList = {
  id: string;
  list_key: string;
  entity_type: string;
  dimension_key: string;
  label: string;
  description: string;
  public_visible: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
  options: ControlledVocabularyOption[];
};
export function controlledVocabularyCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-controlled-vocabularies", body, true);
}
export function masterDataCommand<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return invoke<T>(session, "cms-master-data", body, idempotencyKey ?? false);
}
export function pimCommand<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-pim", body, idempotencyKey ?? false);
}
export function attributesCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-attributes", body);
}
export function usersCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-users", body);
}
export function scopedAccessCommand<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return invoke<T>(session, "cms-scopes", body, idempotencyKey ?? false);
}

export function visualStudioCommand<T>(
  session: Session,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return invoke<T>(session, "cms-visual", body, idempotencyKey ?? false);
}

export function sitesCommand<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-sites", body, idempotencyKey ?? false);
}

export function aiAssistCommand<T>(session: Session, body: Record<string, unknown>, idempotencyKey?: string) {
  return invoke<T>(session, "cms-ai", body, idempotencyKey ?? false);
}
