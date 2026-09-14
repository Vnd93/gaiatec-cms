begin;

-- The QA system snapshot always reconciles the synthetic lead created by G11.
-- Its authoritative scope and divergence checks address four retained child
-- tables by lead_id, but PostgreSQL does not index referencing foreign keys
-- automatically.  Every canary therefore re-scanned the complete anonymized
-- history and exposed a repeatable cold-cache p95 tail.  Keep every predicate,
-- RLS policy and permission unchanged while bounding those exact lookups.
create index if not exists cms_lead_consents_lead_id_idx
  on public.cms_lead_consents (lead_id);

create index if not exists cms_lead_status_history_lead_id_idx
  on public.cms_lead_status_history (lead_id);

create index if not exists cms_lead_outbox_lead_id_idx
  on public.cms_lead_outbox (lead_id);

create index if not exists cms_lead_outbox_replays_lead_id_idx
  on public.cms_lead_outbox_replays (lead_id);

commit;
