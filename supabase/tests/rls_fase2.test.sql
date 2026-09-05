begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temp table fase2_test_results (seq integer not null, result text not null);
grant insert, select on fase2_test_results to authenticated;
insert into fase2_test_results values (0, plan(7));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.synthetic@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other.synthetic@example.test', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked.synthetic@example.test', '', now(), '{}', '{}', now(), now());

insert into public.rdo_user_access (user_id, role, active)
values
  ('10000000-0000-0000-0000-000000000001', 'rdo_member', true),
  ('10000000-0000-0000-0000-000000000002', 'rdo_member', true);

insert into public.rdo_relatorios (id, created_by, status, cliente, contrato)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'rascunho', 'Cliente sintético', 'RDO-TEST-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into fase2_test_results
select 1, results_eq('select count(*)::bigint from public.rdo_relatorios', array[1::bigint], 'owner can read own draft');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
insert into fase2_test_results
select 2, results_eq('select count(*)::bigint from public.rdo_relatorios', array[0::bigint], 'other member cannot read owner draft');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into fase2_test_results
select 3, results_eq('select count(*)::bigint from public.rdo_relatorios', array[0::bigint], 'user without RDO scope reads nothing');

insert into fase2_test_results
select 4, throws_ok(
  $$insert into public.rdo_relatorios (created_by, status, cliente, contrato) values ('10000000-0000-0000-0000-000000000001', 'rascunho', 'Cliente forjado', 'RDO-TEST-02')$$,
  '42501',
  null,
  'user without scope cannot forge an owner'
);

reset role;
update public.rdo_relatorios set status = 'finalizado' where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into fase2_test_results
select 5, results_eq(
  $$with changed as (
      update public.rdo_relatorios
      set comentarios = 'mutado'
      where id = '20000000-0000-0000-0000-000000000001'
      returning 1
    ) select count(*)::bigint from changed$$,
  array[0::bigint],
  'finalized report cannot be updated by its owner'
);
insert into fase2_test_results
select 6, results_eq(
  $$with changed as (
      delete from public.rdo_relatorios
      where id = '20000000-0000-0000-0000-000000000001'
      returning 1
    ) select count(*)::bigint from changed$$,
  array[0::bigint],
  'finalized report cannot be deleted by its owner'
);
reset role;
insert into fase2_test_results
select 7, results_eq(
  $$select count(*)::bigint from storage.buckets where id in ('rdo-fotos', 'rdo-assinados') and public = false$$,
  array[2::bigint],
  'sensitive buckets stay private'
);

insert into fase2_test_results
select 8, result from finish() as result;
select result from fase2_test_results order by seq;
rollback;
