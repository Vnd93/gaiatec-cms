-- Governed collaboration assignee directory.
-- Exposes only active display names inside the caller's authoritative identity scope.

create function public.cms_list_collaboration_assignees(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_ids uuid[] := array[p_actor_id];
  v_items jsonb;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or p_limit is null
     or p_limit < 1
     or p_limit > 500
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:collaboration.assign', p_aal, p_session_id, p_issued_at
     )
     or not public.cms_ev2_collaboration_enabled(
       p_actor_id, p_environment, p_site_key, p_aal, p_session_id, p_issued_at
     ) then
    raise exception 'CMS_COLLABORATION_ASSIGNEES_FORBIDDEN' using errcode = '42501';
  end if;

  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  select coalesce(array_agg(visible.user_id order by visible.user_id), '{}'::uuid[])
  into v_actor_ids
  from (
    select profile.user_id
    from public.cms_profiles profile
    where profile.status = 'active'
      and private.cms_crb_actor_identity_scope_allowed(
        p_actor_id, profile.user_id, p_environment
      )
    order by lower(profile.display_name), profile.user_id
    limit p_limit
  ) visible;

  -- Locks every selected identity lease before the final read so teardown cannot
  -- change a QA scope between authorization and disclosure.
  perform private.cms_crb_lock_actor_scope(p_actor_id, v_actor_ids, p_environment);

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', profile.user_id,
    'displayName', profile.display_name
  ) order by lower(profile.display_name), profile.user_id), '[]'::jsonb)
  into v_items
  from public.cms_profiles profile
  where profile.user_id = any(v_actor_ids)
    and profile.status = 'active'
    and private.cms_crb_actor_identity_scope_allowed(
      p_actor_id, profile.user_id, p_environment
    );

  return jsonb_build_object('schemaVersion', 1, 'items', v_items);
end;
$$;

revoke all on function public.cms_list_collaboration_assignees(
  uuid, text, text, text, text, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.cms_list_collaboration_assignees(
  uuid, text, text, text, text, timestamptz, integer
) to service_role;
