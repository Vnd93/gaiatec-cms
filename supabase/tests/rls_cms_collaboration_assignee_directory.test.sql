begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select has_function(
  'public', 'cms_list_collaboration_assignees',
  array['uuid','text','text','text','text','timestamp with time zone','integer'],
  'governed assignee directory is installed'
);
select is(
  has_function_privilege(
    'service_role',
    'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
    'EXECUTE'
  ), true, 'service role may call the guarded directory'
);
select isnt(
  has_function_privilege(
    'authenticated',
    'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
    'EXECUTE'
  ), true, 'authenticated clients cannot bypass the Edge Function'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('81000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','directory-corporate@example.test','',now(),'{}',
 '{"synthetic":false,"purpose":"ordinary-operator"}',now(),now()),
('81000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','directory-qa-one@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260908-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('81000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','directory-qa-peer@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260908-aaaaaaaa","candidateSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"staging"}',now(),now()),
('81000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','directory-qa-other@example.test','',now(),'{}',
 '{"synthetic":true,"purpose":"qa-cms-browser","runTag":"QA-CMS-FINAL-20260908-bbbbbbbb","candidateSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","environment":"staging"}',now(),now());

insert into public.cms_profiles(user_id,display_name,status) values
('81000000-0000-4000-8000-000000000001','Corporate operator','active'),
('81000000-0000-4000-8000-000000000002','QA operator','active'),
('81000000-0000-4000-8000-000000000003','QA reviewer','active'),
('81000000-0000-4000-8000-000000000004','Other QA run','active');
insert into public.cms_user_roles(user_id,role_key) values
('81000000-0000-4000-8000-000000000001','super_admin'),
('81000000-0000-4000-8000-000000000002','super_admin'),
('81000000-0000-4000-8000-000000000003','super_admin'),
('81000000-0000-4000-8000-000000000004','super_admin');

insert into public.cms_feature_flag_overrides(
  flag_key,environment,scope_type,scope_key,enabled,reason,starts_at,expires_at,created_by
) values
('ev2.collaboration_bulk','staging','user','81000000-0000-4000-8000-000000000001',true,
 'Assignee directory corporate test',now()-interval '1 minute',now()+interval '1 hour',
 '81000000-0000-4000-8000-000000000001'),
('ev2.collaboration_bulk','staging','user','81000000-0000-4000-8000-000000000002',true,
 'Assignee directory QA test',now()-interval '1 minute',now()+interval '1 hour',
 '81000000-0000-4000-8000-000000000002');

select is(
  (public.cms_list_collaboration_assignees(
    '81000000-0000-4000-8000-000000000001','staging','main','aal2',
    'directory-corporate-session',now(),500
  ) -> 'items') @> '[{"displayName":"Corporate operator"}]'::jsonb,
  true, 'corporate operator sees the active corporate directory'
);
select is(
  jsonb_array_length(public.cms_list_collaboration_assignees(
    '81000000-0000-4000-8000-000000000001','staging','main','aal2',
    'directory-corporate-session',now(),500
  ) -> 'items'),
  1, 'corporate directory excludes every ever-QA identity'
);
select is(
  jsonb_array_length(public.cms_list_collaboration_assignees(
    '81000000-0000-4000-8000-000000000002','staging','main','aal2',
    'directory-qa-session',now(),500
  ) -> 'items'),
  2, 'QA directory includes only identities from the same active run'
);
select throws_ok(
  $$select public.cms_list_collaboration_assignees(
    '81000000-0000-4000-8000-000000000002','production','main','aal2',
    'directory-qa-session',now(),500
  )$$,
  '42501','CMS_COLLABORATION_ASSIGNEES_FORBIDDEN',
  'QA directory fails closed for a forged environment'
);

select * from finish();
rollback;
