begin;

-- QA actors are intentionally retained after a canary, together with their archived content and
-- immutable audit trail. Every cleanup therefore adds another historical owner to this table. The
-- active cleanup, watchdog and terminal proof all start from created_by, but the table previously
-- had no index whose leading column was created_by. That made an idempotent zero-row cleanup scan
-- the complete retained history and eventually reach PostgREST's statement deadline.
--
-- Keep the complete owner history addressable because the terminal residue proof reads archived and
-- active rows together. workflow_status is a key column for the active-only cleanup predicates, and
-- id is included so the residue inventory and dependent joins can be satisfied by the same index.
create index if not exists cms_content_items_created_by_workflow_idx
  on public.cms_content_items (created_by, workflow_status)
  include (id);

do $qa_content_cleanup_scale_probe$
declare
  v_index oid := to_regclass('public.cms_content_items_created_by_workflow_idx');
begin
  if v_index is null
     or not exists (
       select 1
       from pg_catalog.pg_index index_row
       where index_row.indexrelid = v_index
         and index_row.indrelid = 'public.cms_content_items'::regclass
         and index_row.indisvalid
         and index_row.indisready
         and not index_row.indisunique
         and index_row.indpred is null
         and index_row.indnkeyatts = 2
         and index_row.indnatts = 3
     )
     or pg_catalog.pg_get_indexdef(v_index, 1, false) <> 'created_by'
     or pg_catalog.pg_get_indexdef(v_index, 2, false) <> 'workflow_status'
     or pg_catalog.pg_get_indexdef(v_index, 3, false) <> 'id' then
    raise exception 'CMS_QA_CONTENT_CLEANUP_INDEX_INVALID' using errcode = '55000';
  end if;
end;
$qa_content_cleanup_scale_probe$;

commit;
