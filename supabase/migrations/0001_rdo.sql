-- ============================================================================
-- RDO — Relatório Diário de Obra (app interno Gaiatec, rotas /app)
-- Aplicar no projeto Supabase existente (SQL Editor ou supabase db push).
-- Modelo de acesso: qualquer usuário AUTENTICADO vê e edita todos os
-- relatórios (ferramenta interna compartilhada da equipe).
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Tabela: relatórios ──────────────────────────────────────────────────────
create table if not exists public.rdo_relatorios (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users (id) on delete set null,
  cliente         text not null default '',
  contrato        text not null default '',
  eng_gaiatec     text,
  eng_cliente     text,
  periodo_inicio  timestamptz,
  periodo_fim     timestamptz,
  local_endereco  text,
  local_lat       double precision,
  local_lng       double precision,
  comentarios     text,
  status          text not null default 'rascunho'
                    check (status in ('rascunho','finalizado','arquivado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finalized_at    timestamptz
);

create index if not exists rdo_relatorios_status_idx     on public.rdo_relatorios (status);
create index if not exists rdo_relatorios_updated_at_idx on public.rdo_relatorios (updated_at desc);
create index if not exists rdo_relatorios_created_by_idx on public.rdo_relatorios (created_by);

-- ── Tabela: fotos ───────────────────────────────────────────────────────────
create table if not exists public.rdo_fotos (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  uuid not null references public.rdo_relatorios (id) on delete cascade,
  storage_path  text not null,
  ordem         integer not null default 0,
  legenda       text,
  created_at    timestamptz not null default now()
);

create index if not exists rdo_fotos_relatorio_idx on public.rdo_fotos (relatorio_id, ordem);

-- ── Trigger: updated_at automático ──────────────────────────────────────────
create or replace function public.rdo_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rdo_relatorios_touch on public.rdo_relatorios;
create trigger rdo_relatorios_touch
  before update on public.rdo_relatorios
  for each row execute function public.rdo_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.rdo_relatorios enable row level security;
alter table public.rdo_fotos      enable row level security;

drop policy if exists "rdo_relatorios_all_authenticated" on public.rdo_relatorios;
create policy "rdo_relatorios_all_authenticated"
  on public.rdo_relatorios
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "rdo_fotos_all_authenticated" on public.rdo_fotos;
create policy "rdo_fotos_all_authenticated"
  on public.rdo_fotos
  for all
  to authenticated
  using (true)
  with check (true);

-- ── Storage: bucket de fotos (leitura pública, escrita autenticada) ─────────
insert into storage.buckets (id, name, public)
values ('rdo-fotos', 'rdo-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "rdo_fotos_public_read" on storage.objects;
create policy "rdo_fotos_public_read"
  on storage.objects for select
  using (bucket_id = 'rdo-fotos');

drop policy if exists "rdo_fotos_auth_insert" on storage.objects;
create policy "rdo_fotos_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'rdo-fotos');

drop policy if exists "rdo_fotos_auth_update" on storage.objects;
create policy "rdo_fotos_auth_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'rdo-fotos')
  with check (bucket_id = 'rdo-fotos');

drop policy if exists "rdo_fotos_auth_delete" on storage.objects;
create policy "rdo_fotos_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'rdo-fotos');

-- ============================================================================
-- USUÁRIOS (login): NÃO há cadastro público. Crie cada usuário da equipe em
-- Supabase → Authentication → Users → "Add user" (e-mail + senha, marque
-- "Auto Confirm User"). Eles entram em gaiatecsistemas.com.br/app/login.
-- ============================================================================
