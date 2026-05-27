import { supabase } from "@/lib/supabase";
import type { Foto, Relatorio, RelatorioInput, RdoStatus } from "./types";

const TABLE = "rdo_relatorios";
const FOTOS = "rdo_fotos";
const BUCKET = "rdo-fotos";

/** URL pública de uma foto no storage. */
export function fotoUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function withUrls(fotos: Foto[]): Foto[] {
  return [...fotos]
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({ ...f, url: fotoUrl(f.storage_path) }));
}

/** Lista relatórios ativos (rascunho+finalizado) ou arquivados. */
export async function listRelatorios(scope: "ativos" | "arquivados"): Promise<Relatorio[]> {
  try {
    const query = supabase.from(TABLE).select("*").order("updated_at", { ascending: false });
    if (scope === "arquivados") query.eq("status", "arquivado");
    else query.in("status", ["rascunho", "finalizado"]);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Relatorio[];
  } catch (e) {
    console.warn("[rdo] listRelatorios falhou (mostrando vazio):", e);
    return [];
  }
}

/** Carrega um relatório com suas fotos. */
export async function getRelatorio(id: string): Promise<Relatorio | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error || !data) return null;
  const fotos = await listFotos(id);
  return { ...(data as Relatorio), fotos };
}

export async function listFotos(relatorioId: string): Promise<Foto[]> {
  const { data, error } = await supabase
    .from(FOTOS)
    .select("*")
    .eq("relatorio_id", relatorioId)
    .order("ordem", { ascending: true });
  if (error) return [];
  return withUrls((data ?? []) as Foto[]);
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Cria um relatório. */
export async function createRelatorio(input: RelatorioInput, status: RdoStatus): Promise<Relatorio> {
  const created_by = await currentUserId();
  const payload: Record<string, unknown> = {
    ...input,
    status,
    created_by,
    finalized_at: status === "finalizado" ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw error;
  return data as Relatorio;
}

/** Atualiza campos + status de um relatório existente. */
export async function updateRelatorio(
  id: string,
  input: RelatorioInput,
  status: RdoStatus,
  jaFinalizado: boolean,
): Promise<Relatorio> {
  const payload: Record<string, unknown> = { ...input, status };
  if (status === "finalizado" && !jaFinalizado) payload.finalized_at = new Date().toISOString();
  const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Relatorio;
}

export async function setStatus(id: string, status: RdoStatus): Promise<void> {
  const payload: Record<string, unknown> = { status };
  if (status === "finalizado") payload.finalized_at = new Date().toISOString();
  const { error } = await supabase.from(TABLE).update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteRelatorio(id: string): Promise<void> {
  // fotos do storage
  const fotos = await listFotos(id);
  if (fotos.length) {
    await supabase.storage.from(BUCKET).remove(fotos.map((f) => f.storage_path));
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Sobe arquivos no storage e cria as linhas em rdo_fotos. */
export async function uploadFotos(
  relatorioId: string,
  files: File[],
  startOrder = 0,
): Promise<Foto[]> {
  const out: Foto[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `relatorios/${relatorioId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (up.error) throw up.error;
    const { data, error } = await supabase
      .from(FOTOS)
      .insert({ relatorio_id: relatorioId, storage_path: path, ordem: startOrder + i })
      .select("*")
      .single();
    if (error) throw error;
    out.push({ ...(data as Foto), url: fotoUrl(path) });
  }
  return out;
}

export async function deleteFoto(foto: Foto): Promise<void> {
  await supabase.storage.from(BUCKET).remove([foto.storage_path]);
  await supabase.from(FOTOS).delete().eq("id", foto.id);
}
