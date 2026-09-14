begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select ok(
  exists (
    select 1
    from pg_catalog.pg_class index_class
    join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
    join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
    where index_namespace.nspname = 'public'
      and index_class.relname = 'cms_operational_events_open_critical_id_idx'
      and index_record.indrelid = 'public.cms_operational_events'::regclass
      and index_record.indisvalid
      and index_record.indisready
      and not index_record.indisunique
      and index_record.indpred is not null
      and index_record.indexprs is null
      and index_record.indnkeyatts = 1
      and index_record.indnatts = 1
      and access_method.amname = 'btree'
      and index_record.indkey[0] = (
        select attribute.attnum
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = 'public.cms_operational_events'::regclass
          and attribute.attname = 'id'
          and not attribute.attisdropped
      )
  ),
  'open-critical snapshot index has the exact structural shape'
);

select is(
  (
    select regexp_replace(
      lower(pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    )
    from pg_catalog.pg_class index_class
    join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
    where index_namespace.nspname = 'public'
      and index_class.relname = 'cms_operational_events_open_critical_id_idx'
  ),
  'severity=''critical''::textandresolved_atisnull',
  'open-critical snapshot index has only the exact partial predicate'
);

select ok(
  position(
    'event.severity = ''critical''' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0,
  'system snapshot still selects critical events'
);

select ok(
  position(
    'event.resolved_at is null' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0,
  'system snapshot still selects only unresolved events'
);

select ok(
  position(
    'private.cms_system_operational_event_scope_allowed' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0,
  'system snapshot retains the authoritative event-scope predicate'
);

select is(
  has_table_privilege('anon', 'public.cms_operational_events', 'SELECT'),
  false,
  'operational events remain closed to anonymous callers before RLS'
);

select * from finish();
rollback;
