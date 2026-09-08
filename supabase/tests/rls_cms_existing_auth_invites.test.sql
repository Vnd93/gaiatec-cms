begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '62000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'existing-rdo-user@example.test', '', now(), '{}', '{}', now(), now()
);

select lives_ok(
  $$insert into public.cms_profiles(user_id, display_name, display_email, status)
    values('62000000-0000-4000-8000-000000000001', 'Identidade existente',
      'EXISTING-RDO-USER@example.test', 'invited')$$,
  'an exact existing Auth identity can receive a separate CMS profile'
);

select throws_ok(
  $$update public.cms_profiles set display_email='other@example.test'
    where user_id='62000000-0000-4000-8000-000000000001'$$,
  '23514', 'CMS_PROFILE_AUTH_EMAIL_MISMATCH',
  'a CMS profile cannot be rebound to another email'
);

select isnt(has_function_privilege('authenticated', 'public.cms_enforce_profile_auth_email()', 'EXECUTE'), true,
  'clients cannot call the identity guard directly');
select isnt(has_table_privilege('authenticated', 'public.cms_profiles', 'INSERT'), true,
  'authenticated users still cannot self-enroll in the CMS');

update public.cms_profiles
set status='suspended', sessions_valid_after='2000-01-01 00:00:00+00'
where user_id='62000000-0000-4000-8000-000000000001';
select lives_ok(
  $$update public.cms_profiles set status='active'
    where user_id='62000000-0000-4000-8000-000000000001'$$,
  'CMS reactivation remains available without changing shared Auth state'
);
select ok(
  (select sessions_valid_after > now() - interval '1 minute'
   from public.cms_profiles where user_id='62000000-0000-4000-8000-000000000001'),
  'reactivation invalidates Auth tokens issued while the CMS profile was suspended'
);
select isnt(
  has_function_privilege('authenticated', 'public.cms_invalidate_sessions_on_reactivation()', 'EXECUTE'),
  true,
  'clients cannot bypass the reactivation session guard'
);

select * from finish();
rollback;
