import type { Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

async function invoke<T>(session: Session, fn: string, body: unknown, idempotent = false): Promise<T> {
  const response = await fetch(SUPABASE_URL + "/functions/v1/" + fn, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
      ...(idempotent ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
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
