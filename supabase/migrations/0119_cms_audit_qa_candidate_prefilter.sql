begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- A QA reader with fewer than six visible events scanned the entire immutable
-- audit history. Preserve the original session, corporate and row predicates;
-- add only a statement-invariant candidate set before the expensive row check.
-- This privileged lookup is necessary for private leases, not an RLS bypass for
-- audit rows. It returns only exact-run actors after the existing permission
-- check; non-browser roles cannot call it. No metadata supplied by a client is
-- used as authority, and no timeout, privilege or audit-history row is changed.
create function public.cms_audit_qa_candidate_actor_ids()
returns uuid[] language sql stable security definer
set search_path=pg_catalog,private,auth,pg_temp
as $$
  select coalesce(array_agg(target.actor_id order by target.actor_id),'{}'::uuid[])
  from private.cms_qa_actor_leases caller
  join private.cms_qa_actor_leases target
    on target.run_tag=caller.run_tag
   and target.candidate_sha=caller.candidate_sha
   and target.environment=caller.environment
  where caller.actor_id=(select auth.uid())
    and (select public.cms_audit_session_scope_allowed())
    and caller.status='active' and target.status='active'
    and caller.expires_at>statement_timestamp()
    and target.expires_at>statement_timestamp()
    and private.cms_user_actor_target_scope_allowed(
      caller.actor_id,target.actor_id,private.cms_user_actor_environment(caller.actor_id)
    );
$$;
revoke all on function public.cms_audit_qa_candidate_actor_ids()
  from public,anon,authenticated,service_role;
grant execute on function public.cms_audit_qa_candidate_actor_ids() to authenticated;

-- Conjunction only: a candidate still must pass the original row guard.
alter policy cms_audit_authorized_read on public.cms_audit_log
using (
  (select public.cms_audit_session_scope_allowed())
  and (
    (select public.cms_audit_corporate_session_allowed())
    or (
      actor_id=any((select public.cms_audit_qa_candidate_actor_ids())::uuid[])
      and public.cms_audit_event_row_allowed(actor_id)
    )
  )
);

do $audit_prefilter_probe$
begin
  if (select count(*) from pg_policy where polrelid='public.cms_audit_log'::regclass
      and polcmd in ('r','*'))<>1
    or not exists(select 1 from pg_policy where polname='cms_audit_authorized_read'
      and polrelid='public.cms_audit_log'::regclass and polcmd='r' and polpermissive
      and polroles=array['authenticated'::regrole]::oid[])
    or has_function_privilege('anon','public.cms_audit_qa_candidate_actor_ids()','EXECUTE')
    or has_function_privilege('service_role','public.cms_audit_qa_candidate_actor_ids()','EXECUTE') then
    raise exception 'CMS_AUDIT_QA_PREFILTER_INSTALLATION_REFUSED' using errcode='55000';
  end if;
end;
$audit_prefilter_probe$;
commit;
