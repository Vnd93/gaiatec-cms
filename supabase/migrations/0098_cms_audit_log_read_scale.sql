begin;

-- The admin home reads the six newest audit events globally. The only existing indexes begin with
-- actor_id or target columns, so that exact order-by/limit shape cannot stop while scanning the
-- index. Staging consequently returned HTTP 500 for the home query while narrower audit reads still
-- succeeded. Keep the authorization conjunction unchanged, but separate its statement-invariant
-- checks from the event-actor check and index the order used by the surface.

create or replace function public.cms_audit_session_scope_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select auth.uid() is not null
    and exists(select 1 from auth.users actor where actor.id = auth.uid())
    and public.cms_has_permission('cms:audit.read');
$$;

create or replace function public.cms_audit_corporate_session_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select auth.uid() is not null
    and exists(select 1 from auth.users actor where actor.id = auth.uid())
    and not exists(
      select 1 from private.cms_qa_actor_leases history
      where history.actor_id = auth.uid()
    );
$$;

create or replace function public.cms_audit_event_row_allowed(p_event_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select p_event_actor_id is not null
    and private.cms_user_actor_target_scope_allowed(
      auth.uid(),
      p_event_actor_id,
      private.cms_user_actor_environment(auth.uid())
    );
$$;

revoke all on function public.cms_audit_session_scope_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.cms_audit_session_scope_allowed() to authenticated;
revoke all on function public.cms_audit_corporate_session_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.cms_audit_corporate_session_allowed() to authenticated;
revoke all on function public.cms_audit_event_row_allowed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cms_audit_event_row_allowed(uuid) to authenticated;

drop policy if exists cms_audit_authorized_read on public.cms_audit_log;
create policy cms_audit_authorized_read
on public.cms_audit_log for select to authenticated
using (
  (select public.cms_audit_session_scope_allowed())
  and (
    (select public.cms_audit_corporate_session_allowed())
    or public.cms_audit_event_row_allowed(actor_id)
  )
);

create index if not exists cms_audit_log_recent_idx
  on public.cms_audit_log (occurred_at desc);

do $audit_log_read_scale_probe$
declare
  v_policy text;
  v_policy_canonical text;
begin
  if (select count(*) from pg_policy
      where polrelid = 'public.cms_audit_log'::regclass and polcmd in ('r', '*')) <> 1
     or not exists (
       select 1 from pg_policy
       where polname = 'cms_audit_authorized_read'
         and polrelid = 'public.cms_audit_log'::regclass
         and polcmd = 'r'
         and polpermissive
         and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
     ) then
    raise exception 'CMS_AUDIT_LOG_POLICY_CARDINALITY_INVALID' using errcode = '55000';
  end if;
  select pg_get_expr(polqual, polrelid) into v_policy
  from pg_policy
  where polname = 'cms_audit_authorized_read'
    and polrelid = 'public.cms_audit_log'::regclass;
  v_policy_canonical := replace(replace(replace(replace(
    lower(regexp_replace(v_policy, '[[:space:]]+', '', 'g')),
    'public.', ''),
    'ascms_audit_session_scope_allowed', ''),
    'ascms_audit_corporate_session_allowed', ''),
    'cms_audit_log.actor_id', 'actor_id');
  if v_policy is null
     or v_policy_canonical <>
       '((selectcms_audit_session_scope_allowed())and((selectcms_audit_corporate_session_allowed())orcms_audit_event_row_allowed(actor_id)))'
     or (
       length(upper(v_policy)) - length(replace(upper(v_policy), 'SELECT', ''))
     ) / length('SELECT') <> 2 then
    raise exception 'CMS_AUDIT_LOG_POLICY_NOT_SPLIT' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index index_record on index_record.indexrelid = index_class.oid
    join pg_am access_method on access_method.oid = index_class.relam
    where index_namespace.nspname = 'public'
      and index_class.relname = 'cms_audit_log_recent_idx'
      and index_record.indrelid = 'public.cms_audit_log'::regclass
      and index_record.indisvalid
      and index_record.indisready
      and not index_record.indisunique
      and index_record.indpred is null
      and index_record.indexprs is null
      and index_record.indnkeyatts = 1
      and index_record.indnatts = 1
      and access_method.amname = 'btree'
      and pg_get_indexdef(index_record.indexrelid, 1, true) = 'occurred_at DESC'
  ) then
    raise exception 'CMS_AUDIT_LOG_RECENT_INDEX_MISSING' using errcode = '55000';
  end if;
end;
$audit_log_read_scale_probe$;

commit;
