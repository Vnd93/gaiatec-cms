-- Fase 3 / CMS-001 — identidade, RBAC e auditoria do novo CMS.
-- Nenhum usuario real ou conteudo editorial e criado por esta migration.

create table public.cms_profiles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 120),
  display_email text check (display_email is null or char_length(display_email) <= 320),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  mfa_enrolled_at timestamptz,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'suspended') = (suspended_at is not null))
);

create table public.cms_roles (
  role_key text primary key check (role_key ~ '^[a-z][a-z0-9_]*$'),
  name text not null unique,
  description text not null,
  mfa_required boolean not null default false,
  system_role boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cms_permissions (
  permission_key text primary key check (
    permission_key ~ '^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  description text not null,
  critical boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.cms_user_roles (
  user_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  role_key text not null references public.cms_roles (role_key) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

create table public.cms_role_permissions (
  role_key text not null references public.cms_roles (role_key) on delete restrict,
  permission_key text not null references public.cms_permissions (permission_key) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table public.cms_session_revocations (
  session_id_hash text primary key check (session_id_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.cms_profiles (user_id) on delete restrict,
  revoked_by uuid references auth.users (id) on delete set null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  revoked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > revoked_at)
);

create table public.cms_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in ('invite', 'login_success', 'login_failure', 'mfa_challenge', 'recovery', 'logout', 'session_revoked')
  ),
  success boolean not null,
  reason_code text check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  mfa_verified boolean not null default false,
  session_id_hash text check (session_id_hash is null or session_id_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid,
  occurred_at timestamptz not null default now()
);

create table public.cms_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_id text,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  correlation_id uuid,
  occurred_at timestamptz not null default now()
);

create index cms_profiles_status_idx on public.cms_profiles (status);
create index cms_user_roles_role_idx on public.cms_user_roles (role_key, user_id);
create index cms_role_permissions_permission_idx on public.cms_role_permissions (permission_key, role_key);
create index cms_session_revocations_user_idx on public.cms_session_revocations (user_id, revoked_at desc);
create index cms_login_events_user_time_idx on public.cms_login_events (user_id, occurred_at desc);
create index cms_audit_log_actor_time_idx on public.cms_audit_log (actor_id, occurred_at desc);
create index cms_audit_log_target_time_idx on public.cms_audit_log (target_type, target_id, occurred_at desc);

insert into public.cms_roles (role_key, name, description, mfa_required)
values
  ('super_admin', 'Super Admin', 'Administracao critica do CMS e de suas permissoes.', true),
  ('admin', 'Admin', 'Administracao operacional sem alterar permissoes criticas.', false),
  ('marketing', 'Marketing', 'Campanhas, homepage, blog e SEO.', false),
  ('commercial', 'Comercial', 'Catalogo comercial, publicacao e leads.', false),
  ('technical', 'Tecnico', 'Dados e revisoes tecnicas.', false),
  ('editor', 'Editor', 'Criacao e edicao sem publicacao.', false),
  ('reviewer', 'Revisor', 'Revisao e aprovacao sem edicao ou publicacao.', false);

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:users.read', 'Consultar perfis administrativos.', false),
  ('cms:users.manage', 'Alterar perfis e papeis administrativos.', true),
  ('cms:users.invite', 'Convidar usuarios por fluxo fechado.', true),
  ('cms:users.suspend', 'Suspender ou reativar usuarios.', true),
  ('cms:sessions.revoke', 'Revogar sessoes administrativas.', true),
  ('cms:roles.read', 'Consultar papeis e permissoes.', false),
  ('cms:roles.manage', 'Alterar a matriz de permissoes.', true),
  ('cms:products.read', 'Consultar catalogo de produtos.', false),
  ('cms:products.edit', 'Editar dados comerciais de produtos.', false),
  ('cms:products.technical', 'Editar dados tecnicos de produtos.', false),
  ('cms:products.publish', 'Publicar produtos.', true),
  ('cms:taxonomy.read', 'Consultar taxonomias.', false),
  ('cms:taxonomy.edit', 'Editar taxonomias.', false),
  ('cms:services.read', 'Consultar servicos e solucoes.', false),
  ('cms:services.edit', 'Editar servicos e solucoes.', false),
  ('cms:services.publish', 'Publicar servicos e solucoes.', true),
  ('cms:homepage.read', 'Consultar homepage e banners.', false),
  ('cms:homepage.edit', 'Editar homepage e banners.', false),
  ('cms:homepage.publish', 'Publicar homepage e banners.', true),
  ('cms:posts.read', 'Consultar blog e campanhas.', false),
  ('cms:posts.edit', 'Editar blog e campanhas.', false),
  ('cms:posts.review', 'Executar revisao editorial ou tecnica.', false),
  ('cms:posts.approve', 'Aprovar conteudo revisado.', true),
  ('cms:posts.publish', 'Publicar blog e campanhas.', true),
  ('cms:seo.read', 'Consultar SEO e redirecionamentos.', false),
  ('cms:seo.edit_basic', 'Editar SEO basico de uma entidade.', false),
  ('cms:seo.edit', 'Editar SEO e redirecionamentos.', true),
  ('cms:leads.read', 'Consultar leads autorizados.', false),
  ('cms:leads.manage', 'Operar status e responsaveis de leads.', false),
  ('cms:leads.export', 'Exportar dados de leads.', true),
  ('cms:appearance.read', 'Consultar presets de aparencia.', false),
  ('cms:appearance.edit', 'Editar presets de aparencia.', true),
  ('cms:audit.read', 'Consultar auditoria administrativa.', true),
  ('cms:diagnostics.read', 'Consultar diagnosticos tecnicos.', false);

insert into public.cms_role_permissions (role_key, permission_key)
select 'super_admin', permission_key from public.cms_permissions;

insert into public.cms_role_permissions (role_key, permission_key)
select 'admin', permission_key
from public.cms_permissions
where permission_key not in (
  'cms:users.manage',
  'cms:users.invite',
  'cms:users.suspend',
  'cms:sessions.revoke',
  'cms:roles.manage'
);

insert into public.cms_role_permissions (role_key, permission_key)
values
  ('commercial', 'cms:products.read'),
  ('commercial', 'cms:products.edit'),
  ('commercial', 'cms:products.publish'),
  ('commercial', 'cms:taxonomy.read'),
  ('commercial', 'cms:services.read'),
  ('commercial', 'cms:services.edit'),
  ('commercial', 'cms:homepage.read'),
  ('commercial', 'cms:posts.read'),
  ('commercial', 'cms:posts.edit'),
  ('commercial', 'cms:seo.read'),
  ('commercial', 'cms:leads.read'),
  ('commercial', 'cms:leads.manage'),
  ('commercial', 'cms:leads.export'),
  ('marketing', 'cms:products.read'),
  ('marketing', 'cms:taxonomy.read'),
  ('marketing', 'cms:services.read'),
  ('marketing', 'cms:services.edit'),
  ('marketing', 'cms:homepage.read'),
  ('marketing', 'cms:homepage.edit'),
  ('marketing', 'cms:homepage.publish'),
  ('marketing', 'cms:posts.read'),
  ('marketing', 'cms:posts.edit'),
  ('marketing', 'cms:posts.publish'),
  ('marketing', 'cms:seo.read'),
  ('marketing', 'cms:seo.edit'),
  ('marketing', 'cms:leads.read'),
  ('marketing', 'cms:appearance.read'),
  ('marketing', 'cms:appearance.edit'),
  ('marketing', 'cms:diagnostics.read'),
  ('technical', 'cms:products.read'),
  ('technical', 'cms:products.technical'),
  ('technical', 'cms:taxonomy.read'),
  ('technical', 'cms:services.read'),
  ('technical', 'cms:services.edit'),
  ('technical', 'cms:homepage.read'),
  ('technical', 'cms:posts.read'),
  ('technical', 'cms:posts.review'),
  ('technical', 'cms:seo.read'),
  ('technical', 'cms:diagnostics.read'),
  ('editor', 'cms:products.read'),
  ('editor', 'cms:products.edit'),
  ('editor', 'cms:taxonomy.read'),
  ('editor', 'cms:services.read'),
  ('editor', 'cms:services.edit'),
  ('editor', 'cms:homepage.read'),
  ('editor', 'cms:homepage.edit'),
  ('editor', 'cms:posts.read'),
  ('editor', 'cms:posts.edit'),
  ('editor', 'cms:seo.read'),
  ('editor', 'cms:seo.edit_basic'),
  ('reviewer', 'cms:products.read'),
  ('reviewer', 'cms:taxonomy.read'),
  ('reviewer', 'cms:services.read'),
  ('reviewer', 'cms:homepage.read'),
  ('reviewer', 'cms:posts.read'),
  ('reviewer', 'cms:posts.review'),
  ('reviewer', 'cms:posts.approve'),
  ('reviewer', 'cms:seo.read');

create function public.cms_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cms_profiles_touch_updated_at
before update on public.cms_profiles
for each row execute function public.cms_touch_updated_at();

create function public.cms_current_session_is_valid()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    auth.jwt() ->> 'session_id' is not null
    and not exists (
      select 1
      from public.cms_session_revocations r
      where r.session_id_hash = encode(extensions.digest(auth.jwt() ->> 'session_id', 'sha256'), 'hex')
        and r.expires_at > now()
    );
$$;

create function public.cms_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.cms_profiles p
    where p.user_id = auth.uid()
      and p.status = 'active'
  ) and public.cms_current_session_is_valid();
$$;

create function public.cms_user_mfa_required()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.cms_user_roles ur
    join public.cms_roles r on r.role_key = ur.role_key
    where ur.user_id = auth.uid() and r.mfa_required
  );
$$;

create function public.cms_has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.cms_user_is_active()
    and (
      not public.cms_user_mfa_required()
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
    and exists (
      select 1
      from public.cms_user_roles ur
      join public.cms_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
        and rp.permission_key = requested_permission
    );
$$;

create function public.cms_reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'CMS audit records are immutable' using errcode = '42501';
end;
$$;

create trigger cms_login_events_immutable
before update or delete on public.cms_login_events
for each row execute function public.cms_reject_immutable_mutation();

create trigger cms_audit_log_immutable
before update or delete on public.cms_audit_log
for each row execute function public.cms_reject_immutable_mutation();

alter table public.cms_profiles enable row level security;
alter table public.cms_roles enable row level security;
alter table public.cms_permissions enable row level security;
alter table public.cms_user_roles enable row level security;
alter table public.cms_role_permissions enable row level security;
alter table public.cms_session_revocations enable row level security;
alter table public.cms_login_events enable row level security;
alter table public.cms_audit_log enable row level security;

create policy "cms_profiles_self_or_users_read"
  on public.cms_profiles for select to authenticated
  using (user_id = auth.uid() or public.cms_has_permission('cms:users.read'));

create policy "cms_roles_authorized_read"
  on public.cms_roles for select to authenticated
  using (public.cms_has_permission('cms:roles.read'));

create policy "cms_permissions_authorized_read"
  on public.cms_permissions for select to authenticated
  using (public.cms_has_permission('cms:roles.read'));

create policy "cms_user_roles_self_or_users_read"
  on public.cms_user_roles for select to authenticated
  using (user_id = auth.uid() or public.cms_has_permission('cms:users.read'));

create policy "cms_role_permissions_authorized_read"
  on public.cms_role_permissions for select to authenticated
  using (public.cms_has_permission('cms:roles.read'));

create policy "cms_session_revocations_self_or_users_read"
  on public.cms_session_revocations for select to authenticated
  using (user_id = auth.uid() or public.cms_has_permission('cms:users.read'));

create policy "cms_login_events_self_or_audit_read"
  on public.cms_login_events for select to authenticated
  using (user_id = auth.uid() or public.cms_has_permission('cms:audit.read'));

create policy "cms_audit_authorized_read"
  on public.cms_audit_log for select to authenticated
  using (public.cms_has_permission('cms:audit.read'));

revoke all on table
  public.cms_profiles,
  public.cms_roles,
  public.cms_permissions,
  public.cms_user_roles,
  public.cms_role_permissions,
  public.cms_session_revocations,
  public.cms_login_events,
  public.cms_audit_log
from anon, authenticated;

grant select on table
  public.cms_profiles,
  public.cms_roles,
  public.cms_permissions,
  public.cms_user_roles,
  public.cms_role_permissions,
  public.cms_session_revocations,
  public.cms_login_events,
  public.cms_audit_log
to authenticated;

grant all on table
  public.cms_profiles,
  public.cms_roles,
  public.cms_permissions,
  public.cms_user_roles,
  public.cms_role_permissions,
  public.cms_session_revocations,
  public.cms_login_events,
  public.cms_audit_log
to service_role;

revoke all on function public.cms_touch_updated_at() from public, anon, authenticated;
revoke all on function public.cms_reject_immutable_mutation() from public, anon, authenticated;
revoke all on function public.cms_current_session_is_valid() from public, anon;
revoke all on function public.cms_user_is_active() from public, anon;
revoke all on function public.cms_user_mfa_required() from public, anon;
revoke all on function public.cms_has_permission(text) from public, anon;

grant execute on function public.cms_current_session_is_valid() to authenticated, service_role;
grant execute on function public.cms_user_is_active() to authenticated, service_role;
grant execute on function public.cms_user_mfa_required() to authenticated, service_role;
grant execute on function public.cms_has_permission(text) to authenticated, service_role;
