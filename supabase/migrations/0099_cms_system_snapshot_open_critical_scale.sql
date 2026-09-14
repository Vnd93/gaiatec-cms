begin;

-- The system snapshot counts only unresolved critical events before applying
-- the authoritative event-scope predicate.  The existing unresolved-recency
-- index still scans every unresolved info/warning row, so retained synthetic
-- history made each snapshot inspect thousands of irrelevant entries.  Keep
-- authorization unchanged and make the exact critical candidate set bounded.
create index if not exists cms_operational_events_open_critical_id_idx
  on public.cms_operational_events (id)
  where severity = 'critical' and resolved_at is null;

commit;
