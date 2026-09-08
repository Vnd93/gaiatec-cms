import { supabase } from "@/lib/supabase";

export const INVALIDATED_EDITOR_SNAPSHOT = "";

export const PUBLISHED_REVISION_NOT_SAVED =
  "Uma nova versão foi aberta, mas estas alterações não foram salvas. O estado editorial foi recarregado; revise os campos e tente salvar novamente. A publicação atual permanece disponível.";

export const PUBLISHED_REVISION_RECONCILIATION_FAILED =
  "Uma nova versão foi aberta, mas estas alterações não foram salvas e o estado editorial não pôde ser recarregado. A publicação atual permanece disponível. Recarregue esta tela antes de continuar.";

type PublishedRevisionSaveOptions<T> = {
  reopen: (() => Promise<unknown>) | null;
  save: () => Promise<T>;
  invalidateSnapshot: () => void;
  reconcile: () => Promise<void>;
};

export async function saveWithPublishedRevisionReconciliation<T>({
  reopen,
  save,
  invalidateSnapshot,
  reconcile,
}: PublishedRevisionSaveOptions<T>): Promise<T> {
  if (!reopen) return save();
  await reopen();
  try {
    return await save();
  } catch (saveError) {
    invalidateSnapshot();
    try {
      await reconcile();
    } catch {
      throw new Error(PUBLISHED_REVISION_RECONCILIATION_FAILED, { cause: saveError });
    }
    throw new Error(PUBLISHED_REVISION_NOT_SAVED, { cause: saveError });
  }
}

export type AuthoritativeEditorialItem = {
  id: string;
  slug: string;
  content_type: string;
  workflow_status: string;
  scheduled_for?: string | null;
  updated_at?: string;
  cms_content_drafts: { payload: Record<string, unknown>; lock_version: number };
  cms_content_revisions: Array<{
    id: string;
    revision_number: number;
    reason: string;
    created_at: string;
    payload?: Record<string, unknown>;
  }>;
};

export async function fetchAuthoritativeEditorialItem(
  itemId: string,
  expectedContentTypes: string | readonly string[],
): Promise<AuthoritativeEditorialItem> {
  const contentTypes = Array.isArray(expectedContentTypes)
    ? [...expectedContentTypes]
    : [expectedContentTypes];
  let query = supabase
    .from("cms_content_items")
    .select(
      "id,slug,content_type,workflow_status,scheduled_for,updated_at,cms_content_drafts(payload,lock_version),cms_content_revisions(id,revision_number,reason,created_at,payload)",
    )
    .eq("id", itemId);
  query =
    contentTypes.length === 1
      ? query.eq("content_type", contentTypes[0])
      : query.in("content_type", contentTypes);
  const { data, error } = await query.single();
  if (error || !data)
    throw new Error(
      "Não foi possível recarregar o estado editorial. Recarregue esta tela antes de continuar.",
    );
  return data as unknown as AuthoritativeEditorialItem;
}
