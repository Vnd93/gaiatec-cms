-- Per-role fingerprints, one por linha, na MESMA ordem e com a MESMA forma canonica de
-- fingerprint-roles.sql. Existe para que uma divergencia de restauracao consiga se nomear: sozinho, o
-- agregado so diz "diferente", nunca se faltam papeis, se sobram ou se um atributo derivou.
--
-- Nenhum nome de papel sai daqui. Cada linha traz o hash do nome e o hash canonico completo: o
-- primeiro separa "papel ausente" de "papel que derivou de atributo", o segundo detecta a derivacao.
-- O consumidor compara conjuntos de hashes e reporta apenas
-- contagens, preservando `containsRoleNames: false` nos relatorios.
--
-- A correspondencia com o agregado nao e por confianca: verify-role-backup.mjs recalcula
-- count(*) e o sha256 da concatenacao ordenada a partir destas linhas e recusa se nao baterem.
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
  select
    encode(
      extensions.digest(convert_to(canonical ->> 'name', 'UTF8'), 'sha256'),
      'hex'
    ) as name_hash,
    encode(
      extensions.digest(convert_to(canonical::text, 'UTF8'), 'sha256'),
      'hex'
    ) as fingerprint,
    -- Perfil do papel sem o nome: e o que permite dizer O QUE falta ou derivou (um papel de
    -- LOGIN com bypassrls nao e a mesma coisa que um papel de plataforma sem login) sem dizer
    -- QUEM. Os vinculos tambem viram hash, senao o nome voltaria pela lista de memberOf.
    (
      (canonical - 'name') || jsonb_build_object('memberOf', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'role', encode(extensions.digest(convert_to(entry ->> 'role', 'UTF8'), 'sha256'), 'hex'),
            'adminOption', entry -> 'adminOption'
          )
          order by entry ->> 'role'
        )
        from jsonb_array_elements(canonical -> 'memberOf') as entry
      ), '[]'::jsonb))
    )::text as attributes
  from role_records
)
select name_hash || chr(9) || fingerprint || chr(9) || attributes
from role_hashes
order by fingerprint;
