-- Fase 1 / Gate G1 — contenção P0 do RDO e dos formulários públicos.
-- Esta migration é deliberadamente fail-closed e não contém dados reais.

create extension if not exists pgcrypto;

-- Escopo RDO independente de qualquer papel futuro do CMS.
create table if not exists public.rdo_user_access (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role text not null check (role in ('rdo_admin', 'rdo_member')),
  active boolean not null default true,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.rdo_user_access enable row level security;

-- Compatibilidade controlada: somente contas que já receberam papel explícito
-- no RDO antigo entram na allowlist. Contas criadas pelo OTP aberto, sem papel,
-- permanecem bloqueadas e exigem convite/revisão nominal.
insert into public.rdo_user_access (user_id, role, active)
select
  id,
  case when raw_app_meta_data ->> 'role' = 'admin' then 'rdo_admin' else 'rdo_member' end,
  true
from auth.users
where raw_app_meta_data ->> 'role' in ('admin', 'membro')
on conflict (user_id) do nothing;

-- Remove o helper legado sem argumentos depois de retirar suas dependências.
-- A versão abaixo usa um alvo explícito/opcional e consulta a allowlist RDO.
drop policy if exists "rdo_rel_select" on public.rdo_relatorios;
drop policy if exists "rdo_rel_insert" on public.rdo_relatorios;
drop policy if exists "rdo_rel_update" on public.rdo_relatorios;
drop policy if exists "rdo_rel_delete" on public.rdo_relatorios;
drop policy if exists "rdo_fotos_select" on public.rdo_fotos;
drop policy if exists "rdo_fotos_insert" on public.rdo_fotos;
drop policy if exists "rdo_fotos_update" on public.rdo_fotos;
drop policy if exists "rdo_fotos_delete" on public.rdo_fotos;
drop function if exists public.rdo_is_admin();

create or replace function public.rdo_user_is_active(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rdo_user_access a
    where a.user_id = target_user and a.active
  );
$$;

create or replace function public.rdo_is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rdo_user_access a
    where a.user_id = target_user and a.active and a.role = 'rdo_admin'
  );
$$;

revoke all on function public.rdo_user_is_active(uuid) from public, anon;
revoke all on function public.rdo_is_admin(uuid) from public, anon;
grant execute on function public.rdo_user_is_active(uuid) to authenticated, service_role;
grant execute on function public.rdo_is_admin(uuid) to authenticated, service_role;

drop policy if exists "rdo_access_self_or_admin" on public.rdo_user_access;
create policy "rdo_access_self_or_admin"
  on public.rdo_user_access for select to authenticated
  using (user_id = auth.uid() or public.rdo_is_admin());

-- Versionamento, snapshot e evidência. A versão anterior nunca é sobrescrita.
alter table public.rdo_relatorios
  add column if not exists version_group_id uuid,
  add column if not exists version_number integer not null default 1,
  add column if not exists supersedes_id uuid references public.rdo_relatorios (id) on delete restrict,
  add column if not exists correction_reason text,
  add column if not exists immutable_snapshot jsonb,
  add column if not exists snapshot_hash text,
  add column if not exists signed_pdf_hash text,
  add column if not exists canonical_pdf_path text,
  add column if not exists canonical_pdf_hash text,
  add column if not exists canonical_pdf_generated_at timestamptz,
  add column if not exists assinatura_gaiatec_source_hash text,
  add column if not exists assinatura_cliente_source_hash text,
  add column if not exists terms_hash text,
  add column if not exists assinatura_token_hash text,
  add column if not exists archived_at timestamptz;

update public.rdo_relatorios
set version_group_id = id
where version_group_id is null;

alter table public.rdo_relatorios
  alter column version_group_id set default gen_random_uuid(),
  alter column version_group_id set not null;

create unique index if not exists rdo_version_group_number_uidx
  on public.rdo_relatorios (version_group_id, version_number);
create unique index if not exists rdo_assinatura_token_hash_uidx
  on public.rdo_relatorios (assinatura_token_hash)
  where assinatura_token_hash is not null;

-- Tokens antigos continuam verificáveis pelo hash e deixam de ser armazenados
-- em claro. Novos tokens são criados somente pelo comando server-side.
update public.rdo_relatorios
set assinatura_token_hash = encode(digest(assinatura_token::text, 'sha256'), 'hex'),
    assinatura_token = null
where assinatura_token is not null and assinatura_token_hash is null;

create table if not exists public.rdo_audit_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.rdo_relatorios (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  event_data jsonb not null default '{}'::jsonb,
  evidence_hash text,
  occurred_at timestamptz not null default now()
);
alter table public.rdo_audit_events enable row level security;

drop policy if exists "rdo_audit_read_owner_or_admin" on public.rdo_audit_events;
create policy "rdo_audit_read_owner_or_admin"
  on public.rdo_audit_events for select to authenticated
  using (
    public.rdo_is_admin()
    or exists (
      select 1 from public.rdo_relatorios r
      where r.id = report_id and r.created_by = auth.uid()
    )
  );

create table if not exists public.rdo_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null,
  idempotency_key uuid not null,
  report_id uuid references public.rdo_relatorios (id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, action, idempotency_key)
);
alter table public.rdo_command_receipts enable row level security;

create table if not exists public.rdo_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rdo_relatorios (id) on delete restrict,
  action text not null,
  idempotency_key uuid not null unique,
  requested_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.rdo_notification_outbox enable row level security;

-- Limite transacional compartilhado por funções públicas. Somente service_role.
create table if not exists public.request_rate_limits (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (key_hash, action)
);
alter table public.request_rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.request_rate_limits%rowtype;
  window_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.request_rate_limits (key_hash, action, window_started_at, request_count)
  values (p_key_hash, p_action, now(), 1)
  on conflict (key_hash, action) do update
    set window_started_at = case
          when public.request_rate_limits.window_started_at < window_cutoff then now()
          else public.request_rate_limits.window_started_at
        end,
        request_count = case
          when public.request_rate_limits.window_started_at < window_cutoff then 1
          else public.request_rate_limits.request_count + 1
        end
  returning * into current_row;

  return current_row.request_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- RLS fail-closed: acesso ativo, ownership e somente rascunho mutável pelo cliente.
drop policy if exists "rdo_rel_select" on public.rdo_relatorios;
drop policy if exists "rdo_rel_insert" on public.rdo_relatorios;
drop policy if exists "rdo_rel_update" on public.rdo_relatorios;
drop policy if exists "rdo_rel_delete" on public.rdo_relatorios;

create policy "rdo_rel_select" on public.rdo_relatorios
  for select to authenticated
  using (
    public.rdo_user_is_active()
    and (created_by = auth.uid() or public.rdo_is_admin())
  );

create policy "rdo_rel_insert" on public.rdo_relatorios
  for insert to authenticated
  with check (
    public.rdo_user_is_active()
    and created_by = auth.uid()
    and status = 'rascunho'
    and assinatura_status = 'nao_assinado'
  );

create policy "rdo_rel_update_draft" on public.rdo_relatorios
  for update to authenticated
  using (
    public.rdo_user_is_active()
    and (created_by = auth.uid() or public.rdo_is_admin())
    and status = 'rascunho'
    and assinatura_status = 'nao_assinado'
  )
  with check (
    public.rdo_user_is_active()
    and (created_by = auth.uid() or public.rdo_is_admin())
    and status = 'rascunho'
    and assinatura_status = 'nao_assinado'
  );

create policy "rdo_rel_delete_draft" on public.rdo_relatorios
  for delete to authenticated
  using (
    public.rdo_user_is_active()
    and (created_by = auth.uid() or public.rdo_is_admin())
    and status = 'rascunho'
    and assinatura_status = 'nao_assinado'
  );

drop policy if exists "rdo_fotos_select" on public.rdo_fotos;
drop policy if exists "rdo_fotos_insert" on public.rdo_fotos;
drop policy if exists "rdo_fotos_update" on public.rdo_fotos;
drop policy if exists "rdo_fotos_delete" on public.rdo_fotos;

create policy "rdo_fotos_select" on public.rdo_fotos
  for select to authenticated
  using (public.rdo_user_is_active() and exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

create policy "rdo_fotos_insert_draft" on public.rdo_fotos
  for insert to authenticated
  with check (public.rdo_user_is_active() and exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id
      and (r.created_by = auth.uid() or public.rdo_is_admin())
      and r.status = 'rascunho' and r.assinatura_status = 'nao_assinado'
  ));

create policy "rdo_fotos_update_draft" on public.rdo_fotos
  for update to authenticated
  using (public.rdo_user_is_active() and exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id
      and (r.created_by = auth.uid() or public.rdo_is_admin())
      and r.status = 'rascunho' and r.assinatura_status = 'nao_assinado'
  ));

create policy "rdo_fotos_delete_draft" on public.rdo_fotos
  for delete to authenticated
  using (public.rdo_user_is_active() and exists (
    select 1 from public.rdo_relatorios r
    where r.id = relatorio_id
      and (r.created_by = auth.uid() or public.rdo_is_admin())
      and r.status = 'rascunho' and r.assinatura_status = 'nao_assinado'
  ));

-- Defesa em profundidade contra UPDATE/DELETE genérico mesmo via policy antiga.
create or replace function public.rdo_guard_immutable_report()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' or old.assinatura_status <> 'nao_assinado' then
      raise exception 'RDO_IMMUTABLE: relatório finalizado/assinado não pode ser excluído';
    end if;
    return old;
  end if;

  if (old.status <> 'rascunho' or old.assinatura_status <> 'nao_assinado')
     and jwt_role <> 'service_role' then
    raise exception 'RDO_IMMUTABLE: crie uma versão corretiva';
  end if;
  return new;
end;
$$;

drop trigger if exists rdo_guard_immutable on public.rdo_relatorios;
create trigger rdo_guard_immutable
  before update or delete on public.rdo_relatorios
  for each row execute function public.rdo_guard_immutable_report();

-- Fotos privadas e vinculadas ao relatório/dono.
insert into storage.buckets (id, name, public)
values ('rdo-fotos', 'rdo-fotos', false)
on conflict (id) do update set public = false;

drop policy if exists "rdo_fotos_public_read" on storage.objects;
drop policy if exists "rdo_fotos_auth_insert" on storage.objects;
drop policy if exists "rdo_fotos_auth_update" on storage.objects;
drop policy if exists "rdo_fotos_auth_delete" on storage.objects;
drop policy if exists "rdo_storage_fotos_read" on storage.objects;
drop policy if exists "rdo_storage_fotos_insert" on storage.objects;
drop policy if exists "rdo_storage_fotos_update" on storage.objects;
drop policy if exists "rdo_storage_fotos_delete" on storage.objects;

create policy "rdo_storage_fotos_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'rdo-fotos' and public.rdo_user_is_active() and exists (
    select 1 from public.rdo_fotos f
    join public.rdo_relatorios r on r.id = f.relatorio_id
    where f.storage_path = name and (r.created_by = auth.uid() or public.rdo_is_admin())
  ));

create policy "rdo_storage_fotos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rdo-fotos'
    and public.rdo_user_is_active()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (
      select 1 from public.rdo_relatorios r
      where name like ('relatorios/' || r.id::text || '/%')
        and (r.created_by = auth.uid() or public.rdo_is_admin())
        and r.status = 'rascunho' and r.assinatura_status = 'nao_assinado'
    )
  );

create policy "rdo_storage_fotos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'rdo-fotos' and false);

create policy "rdo_storage_fotos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'rdo-fotos' and public.rdo_user_is_active() and exists (
    select 1 from public.rdo_fotos f
    join public.rdo_relatorios r on r.id = f.relatorio_id
    where f.storage_path = name
      and (r.created_by = auth.uid() or public.rdo_is_admin())
      and r.status = 'rascunho' and r.assinatura_status = 'nao_assinado'
  ));

-- PDFs assinados também são privados. Escritas e remoções ocorrem somente
-- nas Edge Functions com service_role; usuários ativos podem apenas gerar
-- URL temporária para PDFs de relatórios aos quais já têm acesso.
insert into storage.buckets (id, name, public)
values ('rdo-assinados', 'rdo-assinados', false)
on conflict (id) do update set public = false;

drop policy if exists "rdo_assinados_auth_read" on storage.objects;
drop policy if exists "rdo_assinados_auth_insert" on storage.objects;
drop policy if exists "rdo_assinados_auth_update" on storage.objects;
drop policy if exists "rdo_assinados_auth_delete" on storage.objects;
drop policy if exists "rdo_storage_assinados_read" on storage.objects;

create policy "rdo_storage_assinados_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rdo-assinados'
    and public.rdo_user_is_active()
    and exists (
      select 1 from public.rdo_relatorios r
      where (r.created_by = auth.uid() or public.rdo_is_admin())
        and name in (r.assinatura_gaiatec_pdf_path, r.assinatura_cliente_pdf_path, r.canonical_pdf_path)
    )
  );

-- Formulário público atual: persistência mínima segregada e outbox idempotente.
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text check (last_name is null or char_length(last_name) <= 100),
  email text not null check (char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  company text check (company is null or char_length(company) <= 160),
  enquiry_type text check (enquiry_type is null or char_length(enquiry_type) <= 80),
  message text not null check (char_length(message) between 1 and 4000),
  origin_path text check (origin_path is null or char_length(origin_path) <= 500),
  consent_version text not null,
  consent_text text not null,
  privacy_policy_url text not null,
  consented_at timestamptz not null default now(),
  abuse_score integer not null default 0,
  technical_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.contact_submissions enable row level security;

create table if not exists public.contact_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.contact_submissions (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.contact_notification_outbox enable row level security;

-- Não há policy pública: somente funções com service_role persistem/leem.
revoke all on public.rdo_user_access, public.rdo_audit_events,
  public.rdo_command_receipts, public.rdo_notification_outbox,
  public.request_rate_limits, public.contact_submissions,
  public.contact_notification_outbox from anon;
