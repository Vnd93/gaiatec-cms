begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select is(
  (
    with expected(table_name, index_name) as (
      values
        ('cms_lead_consents', 'cms_lead_consents_lead_id_idx'),
        ('cms_lead_status_history', 'cms_lead_status_history_lead_id_idx'),
        ('cms_lead_outbox', 'cms_lead_outbox_lead_id_idx'),
        ('cms_lead_outbox_replays', 'cms_lead_outbox_replays_lead_id_idx')
    )
    select count(*)
    from expected
    join pg_catalog.pg_class index_class on index_class.relname = expected.index_name
    join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid = index_class.oid
    join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
    where index_namespace.nspname = 'public'
      and index_record.indrelid = pg_catalog.to_regclass('public.' || expected.table_name)
      and index_record.indisvalid
      and index_record.indisready
      and not index_record.indisunique
      and index_record.indpred is null
      and index_record.indexprs is null
      and index_record.indnkeyatts = 1
      and index_record.indnatts = 1
      and access_method.amname = 'btree'
      and index_record.indkey[0] = (
        select attribute.attnum
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = index_record.indrelid
          and attribute.attname = 'lead_id'
          and not attribute.attisdropped
      )
  ),
  4::bigint,
  'all snapshot lead lookups have an exact valid btree index'
);

select ok(
  position(
    'private.cms_lead_scope_allowed' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'consent.lead_id = lead.id' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'history.lead_id = lead.id' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0
  and position(
    'outbox.lead_id = lead.id' in
    pg_catalog.pg_get_functiondef(
      'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)'::regprocedure
    )
  ) > 0,
  'system snapshot retains authoritative lead scope and divergence checks'
);

select ok(
  position(
    'history.lead_id = lead.id' in
    pg_catalog.pg_get_functiondef(
      'private.cms_lead_scope_allowed(uuid,uuid,text)'::regprocedure
    )
  ) > 0
  and position(
    'replay.lead_id = lead.id' in
    pg_catalog.pg_get_functiondef(
      'private.cms_lead_scope_allowed(uuid,uuid,text)'::regprocedure
    )
  ) > 0,
  'deep lead scope retains history and replay ownership checks'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated snapshot boundary remains executable'
);

select is(
  has_function_privilege(
    'anon',
    'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous snapshot boundary remains closed'
);

select is(
  has_function_privilege(
    'service_role',
    'public.cms_get_system_snapshot_authenticated(text,text,uuid)',
    'EXECUTE'
  ),
  false,
  'service role cannot impersonate an authenticated snapshot caller'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.cms_get_system_snapshot(uuid,text,text,text,text,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot bypass the derived identity boundary'
);

select is(
  (
    select bool_or(pg_catalog.has_table_privilege('anon', table_name, 'SELECT'))
    from unnest(array[
      'public.cms_lead_consents',
      'public.cms_lead_status_history',
      'public.cms_lead_outbox',
      'public.cms_lead_outbox_replays'
    ]) as target(table_name)
  ),
  false,
  'lead child tables remain closed to anonymous callers before RLS'
);

select * from finish();
rollback;
