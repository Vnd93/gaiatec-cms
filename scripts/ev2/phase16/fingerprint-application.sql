\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\if :SNAPSHOT_MODE
begin isolation level repeatable read read only;
set transaction snapshot :'SNAPSHOT_ID';
\endif

select format(
  'select %L || chr(9) || count(*)::text || chr(9) || encode(extensions.digest(convert_to(coalesce(string_agg(encode(extensions.digest(convert_to(to_jsonb(source_row)::text, ''UTF8''), ''sha256''), ''hex''), '''' order by encode(extensions.digest(convert_to(to_jsonb(source_row)::text, ''UTF8''), ''sha256''), ''hex'')), ''''), ''UTF8''), ''sha256''), ''hex'') from %I.%I source_row;',
  schemaname || '.' || tablename,
  schemaname,
  tablename
)
from pg_tables
where schemaname in ('public', 'private')
order by schemaname, tablename
\gexec

\if :SNAPSHOT_MODE
commit;
\endif
