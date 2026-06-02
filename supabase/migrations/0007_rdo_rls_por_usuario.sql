-- ============================================================================
-- RDO 0007 — Isolamento por usuário (RLS) + throttle do OTP
--   Antes: qualquer autenticado via TODOS os relatórios (using(true)).
--   Agora: cada usuário vê apenas os que CRIOU; admin (marcelo) vê tudo.
--   Admin = app_metadata.role == 'admin' (presente no JWT).
-- ============================================================================

-- Helper: o usuário atual é admin? (lê o role do JWT)
create or replace function public.rdo_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ── rdo_relatorios: ownership + escape de admin ─────────────────────────────
drop policy if exists "rdo_relatorios_all_authenticated" on public.rdo_relatorios;
drop policy if exists "rdo_rel_select" on public.rdo_relatorios;
drop policy if exists "rdo_rel_insert" on public.rdo_relatorios;
drop policy if exists "rdo_rel_update" on public.rdo_relatorios;
drop policy if exists "rdo_rel_delete" on public.rdo_relatorios;

create policy "rdo_rel_select" on public.rdo_relatorios
  for select to authenticated
  using (created_by = auth.uid() or public.rdo_is_admin());

create policy "rdo_rel_insert" on public.rdo_relatorios
  for insert to authenticated
  with check (created_by = auth.uid() or public.rdo_is_admin());

create policy "rdo_rel_update" on public.rdo_relatorios
  for update to authenticated
  using (created_by = auth.uid() or public.rdo_is_admin())
  with check (created_by = auth.uid() or public.rdo_is_admin());

create policy "rdo_rel_delete" on public.rdo_relatorios
  for delete to authenticated
  using (created_by = auth.uid() or public.rdo_is_admin());

-- ── rdo_fotos: segue o dono do relatório pai ────────────────────────────────
drop policy if exists "rdo_fotos_all_authenticated" on public.rdo_fotos;
drop policy if exists "rdo_fotos_select" on public.rdo_fotos;
drop policy if exists "rdo_fotos_insert" on public.rdo_fotos;
drop policy if exists "rdo_fotos_update" on public.rdo_fotos;
drop policy if exists "rdo_fotos_delete" on public.rdo_fotos;

create policy "rdo_fotos_select" on public.rdo_fotos
  for select to authenticated
  using (exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

create policy "rdo_fotos_insert" on public.rdo_fotos
  for insert to authenticated
  with check (exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

create policy "rdo_fotos_update" on public.rdo_fotos
  for update to authenticated
  using (exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

create policy "rdo_fotos_delete" on public.rdo_fotos
  for delete to authenticated
  using (exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

-- ── Throttle do OTP (acessado só via service_role na Edge Function) ─────────
create table if not exists public.rdo_otp_throttle (
  email        text primary key,
  last_sent_at timestamptz not null default now()
);
alter table public.rdo_otp_throttle enable row level security;
-- sem policies: nenhum cliente (anon/authenticated) lê/escreve; service_role ignora a RLS.
