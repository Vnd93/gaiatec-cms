\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

with role_records as (
  select jsonb_build_object(
    'name', role_record.rolname,
    'superuser', role_record.rolsuper,
    'inherit', role_record.rolinherit,
    'createRole', role_record.rolcreaterole,
    'createDb', role_record.rolcreatedb,
    'canLogin', role_record.rolcanlogin,
    'replication', role_record.rolreplication,
    'connectionLimit', role_record.rolconnlimit,
    'bypassRls', role_record.rolbypassrls,
    'validUntil', role_record.rolvaliduntil,
    'memberOf', coalesce((
      select jsonb_agg(
        jsonb_build_object('role', parent.rolname, 'adminOption', membership.admin_option)
        order by parent.rolname
      )
      from pg_auth_members membership
      join pg_roles parent on parent.oid = membership.roleid
      where membership.member = role_record.oid
    ), '[]'::jsonb)
  ) as canonical
  from pg_roles role_record
  where role_record.rolname !~ '^pg_'
), role_hashes as (
  select encode(
    extensions.digest(convert_to(canonical::text, 'UTF8'), 'sha256'),
    'hex'
  ) as fingerprint
  from role_records
)
select count(*)::text || chr(9) || encode(
  extensions.digest(
    convert_to(coalesce(string_agg(fingerprint, '' order by fingerprint), ''), 'UTF8'),
    'sha256'
  ),
  'hex'
)
from role_hashes;
