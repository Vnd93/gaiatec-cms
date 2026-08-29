-- Fase 4 — lote autorizado: documentos privados e helpers de autorização fora do schema exposto.
-- Nenhum conteúdo editorial é inserido por migration.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cms-documents-private', 'cms-documents-private', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.cms_current_session_is_valid()
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    auth.jwt() ->> 'session_id' is not null
    and coalesce(auth.jwt() ->> 'iat', '') ~ '^[0-9]+$'
    and not exists (
      select 1 from public.cms_profiles p
      where p.user_id = auth.uid()
        and p.sessions_valid_after > to_timestamp((auth.jwt() ->> 'iat')::double precision)
    )
    and not exists (
      select 1 from public.cms_session_revocations r
      where r.session_id_hash = encode(extensions.digest(auth.jwt() ->> 'session_id', 'sha256'), 'hex')
        and r.expires_at > now()
    );
$$;

create or replace function private.cms_user_is_active()
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.cms_profiles p
    where p.user_id = auth.uid() and p.status = 'active'
  ) and private.cms_current_session_is_valid();
$$;

create or replace function private.cms_user_mfa_required()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cms_user_roles ur
    join public.cms_roles r on r.role_key = ur.role_key
    where ur.user_id = auth.uid() and r.mfa_required
  );
$$;

create or replace function private.cms_has_permission(requested_permission text)
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select
    private.cms_user_is_active()
    and (not private.cms_user_mfa_required() or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
    and exists (
      select 1 from public.cms_user_roles ur
      join public.cms_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid() and rp.permission_key = requested_permission
    );
$$;

revoke all on function private.cms_current_session_is_valid() from public, anon;
revoke all on function private.cms_user_is_active() from public, anon;
revoke all on function private.cms_user_mfa_required() from public, anon;
revoke all on function private.cms_has_permission(text) from public, anon;
grant execute on function private.cms_current_session_is_valid() to authenticated, service_role;
grant execute on function private.cms_user_is_active() to authenticated, service_role;
grant execute on function private.cms_user_mfa_required() to authenticated, service_role;
grant execute on function private.cms_has_permission(text) to authenticated, service_role;

create or replace function public.cms_current_session_is_valid()
returns boolean language sql stable security invoker set search_path = private, pg_temp
as $$ select private.cms_current_session_is_valid(); $$;
create or replace function public.cms_user_is_active()
returns boolean language sql stable security invoker set search_path = private, pg_temp
as $$ select private.cms_user_is_active(); $$;
create or replace function public.cms_user_mfa_required()
returns boolean language sql stable security invoker set search_path = private, pg_temp
as $$ select private.cms_user_mfa_required(); $$;
create or replace function public.cms_has_permission(requested_permission text)
returns boolean language sql stable security invoker set search_path = private, pg_temp
as $$ select private.cms_has_permission(requested_permission); $$;
create or replace function public.cms_can_read_content(p_content_type text)
returns boolean language sql stable security invoker set search_path = public, private, pg_temp
as $$ select coalesce(private.cms_has_permission(public.cms_content_permission(p_content_type, 'read')), false); $$;

create or replace function public.cms_validate_product_publication()
returns trigger language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare p jsonb := new.payload;
begin
  if new.content_type <> 'product' then return new; end if;

  if jsonb_typeof(p -> 'media') <> 'array'
     or jsonb_typeof(p -> 'documents') <> 'array'
     or exists (
       select 1 from jsonb_array_elements(p -> 'models') model
       where jsonb_typeof(model -> 'variants') <> 'array' or jsonb_array_length(model -> 'variants') = 0
     ) then
    raise exception 'CMS_PRODUCT_CONTRACT_INVALID' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'specifications') spec
    where (spec ->> 'type') not in ('text', 'number', 'boolean', 'enum', 'range')
       or ((spec ->> 'type') = 'text' and jsonb_typeof(spec -> 'value') <> 'string')
       or ((spec ->> 'type') = 'number' and jsonb_typeof(spec -> 'value') <> 'number')
       or ((spec ->> 'type') = 'boolean' and jsonb_typeof(spec -> 'value') <> 'boolean')
       or ((spec ->> 'type') = 'enum' and jsonb_typeof(spec -> 'value') <> 'array')
       or ((spec ->> 'type') = 'range' and (
         jsonb_typeof(spec -> 'value') <> 'object'
         or jsonb_typeof(spec #> '{value,min}') <> 'number'
         or jsonb_typeof(spec #> '{value,max}') <> 'number'
         or (spec #>> '{value,min}')::numeric > (spec #>> '{value,max}')::numeric
       ))
  ) then raise exception 'CMS_PRODUCT_ATTRIBUTE_TYPE_INVALID' using errcode = '23514'; end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'media') media
    where not exists (
      select 1 from public.cms_media_assets asset
      where asset.id = (media ->> 'assetId')::uuid
        and asset.processing_status = 'ready'
        and asset.scan_status = 'clean'
        and asset.rights_confirmed
    )
  ) then raise exception 'CMS_PRODUCT_MEDIA_NOT_READY' using errcode = '23514'; end if;

  if exists (
    select 1 from jsonb_array_elements(p -> 'documents') document
    where nullif(document ->> 'officialUrl', '') is null
      and (
        nullif(document ->> 'storagePath', '') is null
        or not exists (
          select 1 from storage.objects object
          where object.bucket_id = 'cms-documents-private'
            and object.name = document ->> 'storagePath'
        )
      )
  ) then raise exception 'CMS_PRODUCT_DOCUMENT_NOT_READY' using errcode = '23514'; end if;

  return new;
end;
$$;

revoke all on function public.cms_validate_product_publication() from public, anon, authenticated;
