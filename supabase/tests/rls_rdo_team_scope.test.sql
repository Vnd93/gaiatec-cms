begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('59000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.team.admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('59000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.team.second@example.test', '', now(), '{}', '{}', now(), now()),
  ('59000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rdo.team.member@example.test', '', now(), '{}', '{}', now(), now()),
  ('59000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cms.only@example.test', '', now(), '{}', '{}', now(), now());

insert into public.rdo_user_access (user_id, role, active) values
  ('59000000-0000-4000-8000-000000000001', 'rdo_admin', true),
  ('59000000-0000-4000-8000-000000000002', 'rdo_admin', true),
  ('59000000-0000-4000-8000-000000000003', 'rdo_member', true);

insert into public.cms_profiles (user_id, display_name, display_email, status, mfa_enrolled_at)
values
  ('59000000-0000-4000-8000-000000000003', 'Operador dual scope', 'rdo.team.member@example.test', 'active', now()),
  ('59000000-0000-4000-8000-000000000004', 'Operador exclusivo CMS', 'cms.only@example.test', 'active', now());
insert into public.cms_user_roles (user_id, role_key) values
  ('59000000-0000-4000-8000-000000000003', 'editor'),
  ('59000000-0000-4000-8000-000000000004', 'super_admin');

select has_column('public', 'rdo_user_access', 'lock_version',
  'RDO membership exposes a monotonic lock version');
select hasnt_column('public', 'rdo_user_access', 'management_operation_id',
  'RDO-only commands cannot leave an external Auth reservation orphaned');
select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where n.nspname = 'public' and c.relname = 'rdo_audit_events'
      and t.tgname = 'rdo_audit_events_immutable' and not t.tgisinternal
      and pn.nspname = 'private' and p.proname = 'rdo_reject_audit_mutation'
  ),
  'RDO audit events have an immutable trigger'
);
select isnt(has_function_privilege('anon', 'public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)', 'EXECUTE'), true,
  'anonymous callers cannot invoke the RDO team command');
select isnt(has_function_privilege('authenticated', 'public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)', 'EXECUTE'), true,
  'authenticated callers cannot bypass the RDO team Edge boundary');
select is(has_function_privilege('service_role', 'public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)', 'EXECUTE'), true,
  'service role can invoke the serialized RDO command');
select ok(
  exists (select 1 from public.cms_profiles where user_id = '59000000-0000-4000-8000-000000000004')
  and not exists (select 1 from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000004'),
  'the CMS-only identity has no implicit RDO allowlist entry'
);
select ok(
  exists (select 1 from public.cms_profiles where user_id = '59000000-0000-4000-8000-000000000003')
  and exists (select 1 from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000003'),
  'a dual-scope identity has independent CMS and RDO records'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '59000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.rdo_user_access), 0,
  'a CMS-only identity cannot enumerate RDO memberships through RLS');
reset role;

select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000004','suspend',null,'59000000-0000-4000-8000-000000000101','59000000-0000-4000-8000-000000000201')$$,
  '42501', 'RDO_TEAM_TARGET_NOT_ALLOWLISTED', 'a CMS-only UUID cannot be used as an RDO mutation target');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000003','59000000-0000-4000-8000-000000000002','suspend',null,'59000000-0000-4000-8000-000000000102','59000000-0000-4000-8000-000000000202')$$,
  '42501', 'RDO_TEAM_ACTOR_FORBIDDEN', 'an RDO member cannot mutate another membership');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000003','set_role','cms_admin','59000000-0000-4000-8000-000000000103','59000000-0000-4000-8000-000000000203')$$,
  '22023', 'RDO_TEAM_COMMAND_INVALID', 'a tampered role cannot cross the RDO command boundary');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000001','set_role','rdo_member','59000000-0000-4000-8000-000000000104','59000000-0000-4000-8000-000000000204')$$,
  '42501', 'RDO_TEAM_SELF_PROTECTION', 'an administrator cannot demote itself while redundancy exists');

select lives_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002','suspend',null,'59000000-0000-4000-8000-000000000105','59000000-0000-4000-8000-000000000205')$$,
  'an RDO admin can suspend another admin while redundancy exists');
select is((select active from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000002'), false,
  'suspension is committed atomically in the RDO namespace');
select ok(exists(select 1 from public.rdo_audit_events where action='team.suspend.completed' and event_data->>'operationId'='59000000-0000-4000-8000-000000000105'),
  'the completed RDO-only suspension is audited');
select lives_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002','reactivate',null,'59000000-0000-4000-8000-000000000106','59000000-0000-4000-8000-000000000206')$$,
  'an RDO membership can be reactivated atomically');
select is((select active from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000002'), true,
  'reactivation is immediately visible in RDO access state');

select lives_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000003','suspend',null,'59000000-0000-4000-8000-000000000107','59000000-0000-4000-8000-000000000207')$$,
  'a dual-scope identity can be suspended only from RDO');
select is((select active from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000003'), false,
  'dual-scope RDO access is inactive');
select is((select status from public.cms_profiles where user_id = '59000000-0000-4000-8000-000000000003'), 'active',
  'dual-scope CMS profile remains active');
select is((select count(*)::integer from public.cms_user_roles where user_id = '59000000-0000-4000-8000-000000000003'), 1,
  'dual-scope CMS role remains assigned');
select lives_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000003','reactivate',null,'59000000-0000-4000-8000-000000000108','59000000-0000-4000-8000-000000000208')$$,
  'dual-scope RDO access can be reactivated without touching CMS');
select lives_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000003','set_role','rdo_admin','59000000-0000-4000-8000-000000000109','59000000-0000-4000-8000-000000000209')$$,
  'an active RDO member can be promoted');
select is((select role from public.rdo_user_access where user_id = '59000000-0000-4000-8000-000000000003'), 'rdo_admin',
  'promotion remains in the RDO namespace');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000001','set_role','rdo_member','59000000-0000-4000-8000-000000000110','59000000-0000-4000-8000-000000000210')$$,
  '42501', 'RDO_TEAM_SELF_PROTECTION', 'self-demotion remains blocked while another admin is active');

update public.rdo_user_access set active=false where user_id in ('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000001','suspend',null,'59000000-0000-4000-8000-000000000111','59000000-0000-4000-8000-000000000211')$$,
  '42501', 'RDO_TEAM_LAST_ADMIN_PROTECTED', 'the last active RDO administrator cannot be suspended');
select throws_ok(
  $$select public.rdo_apply_team_member_command('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000001','set_role','rdo_member','59000000-0000-4000-8000-000000000112','59000000-0000-4000-8000-000000000212')$$,
  '42501', 'RDO_TEAM_LAST_ADMIN_PROTECTED', 'the last active RDO administrator cannot be demoted');
select ok((select active and role='rdo_admin' from public.rdo_user_access where user_id='59000000-0000-4000-8000-000000000001'),
  'last-admin protection leaves state unchanged');
select ok((select lock_version > 1 from public.rdo_user_access where user_id='59000000-0000-4000-8000-000000000003'),
  'completed commands advance the optimistic lock monotonically');
select throws_ok($$update public.rdo_audit_events set action='team.tampered' where action='team.suspend.completed'$$,
  '42501', 'RDO audit records are immutable', 'RDO audit event content cannot be rewritten');
select throws_ok($$update public.rdo_audit_events set actor_id=null where action='team.suspend.completed'$$,
  '42501', 'RDO audit records are immutable', 'service role cannot erase RDO audit attribution');
select throws_ok($$delete from public.rdo_audit_events where action='team.suspend.completed'$$,
  '42501', 'RDO audit records are immutable', 'RDO audit events cannot be deleted');

select * from finish();
rollback;
