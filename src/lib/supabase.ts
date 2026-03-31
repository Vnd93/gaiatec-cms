import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pbmyttjnqijdbscrjayk.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBibXl0dGpucWlqZGJzY3JqYXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTM3MTIsImV4cCI6MjA4NzYyOTcxMn0.YtCaZCoKHJTGEHxaCRl3yaf0Aol86oXWjKoD0xgXcok'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const API_BASE = `${SUPABASE_URL}/functions/v1/site-content`

/** Fetch from site-content Edge Function */
export async function fetchSiteContent<T = unknown>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Erro ao buscar conteúdo')
  // Edge Function respond() serializes data directly (no .data wrapper)
  return json as T
}

/** Fetch conteudo_site by grupo prefix and return as key-value map */
export async function fetchConteudo(grupo: string): Promise<Record<string, string>> {
  const items = await fetchSiteContent<Array<{ chave: string; valor: string }>>({
    type: 'conteudo',
    grupo,
  })
  const map: Record<string, string> = {}
  for (const item of items) {
    map[item.chave] = item.valor
  }
  return map
}
