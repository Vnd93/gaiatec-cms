import type { Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

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
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha na operação administrativa.");
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
export function searchGovernanceCommand<T>(session: Session, body: Record<string, unknown>) {
  return invoke<T>(session, "cms-search-admin", body, true);
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
