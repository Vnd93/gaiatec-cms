-- EV2.6 — busca técnica, governança, SEO e Centro de Qualidade.
-- Estrutura aditiva e fail-closed. O índice sombra só recebe projeções já
-- sanitizadas pela Edge Function; esta migration não copia conteúdo existente.

create extension if not exists pg_trgm with schema extensions;

insert into public.cms_permissions (permission_key, description, critical)
values
  ('cms:search.reindex', 'Reconstruir o índice sombra de busca.', true),
  ('cms:quality.read', 'Consultar resultados do Centro de Qualidade.', false),
  ('cms:quality.run', 'Executar verificações determinísticas de qualidade.', false),
  ('cms:quality.manage', 'Administrar regras do Centro de Qualidade.', true),
  ('cms:quality.waive', 'Autorizar exceção temporária de qualidade.', true)
on conflict (permission_key) do nothing;

insert into public.cms_role_permissions (role_key, permission_key)
select 'super_admin', permission_key from public.cms_permissions
where permission_key in ('cms:search.reindex','cms:quality.read','cms:quality.run','cms:quality.manage','cms:quality.waive')
on conflict do nothing;
insert into public.cms_role_permissions (role_key, permission_key)
values
  ('admin','cms:search.reindex'), ('admin','cms:quality.read'), ('admin','cms:quality.run'),
  ('admin','cms:quality.manage'), ('admin','cms:quality.waive'),
  ('marketing','cms:quality.read'), ('marketing','cms:quality.run'),
  ('technical','cms:quality.read'), ('technical','cms:quality.run'),
  ('editor','cms:quality.read'), ('editor','cms:quality.run'),
  ('reviewer','cms:quality.read'), ('reviewer','cms:quality.run')
on conflict do nothing;

alter table public.cms_search_synonyms
  add column reason text,
  add column owner_key text,
  add column starts_at timestamptz,
  add column expires_at timestamptz,
  add column lock_version bigint not null default 1 check (lock_version > 0);
update public.cms_search_synonyms
set reason = coalesce(reason, source_reference), owner_key = coalesce(owner_key, 'legacy'), starts_at = coalesce(starts_at, created_at)
where reason is null or owner_key is null or starts_at is null;
alter table public.cms_search_synonyms alter column reason set not null;
alter table public.cms_search_synonyms alter column owner_key set not null;
alter table public.cms_search_synonyms alter column starts_at set not null;
alter table public.cms_search_synonyms add constraint cms_search_synonyms_window_check
  check (expires_at is null or expires_at > starts_at);

create table public.cms_search_rules (
  id uuid primary key default gen_random_uuid(),
  rule_kind text not null check (rule_kind in ('pin','bury','redirect')),
  normalized_query text not null check (char_length(normalized_query) between 1 and 300),
  target_item_id uuid references public.cms_content_items (id) on delete restrict,
  redirect_path text check (redirect_path is null or redirect_path ~ '^/[a-z0-9/_-]*$'),
  reason text not null check (char_length(reason) between 3 and 500),
  owner_key text not null check (char_length(owner_key) between 2 and 120),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  active boolean not null default true,
  lock_version bigint not null default 1 check (lock_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check ((rule_kind = 'redirect' and redirect_path is not null and target_item_id is null)
      or (rule_kind in ('pin','bury') and target_item_id is not null and redirect_path is null))
);
create index cms_search_rules_lookup_idx on public.cms_search_rules (normalized_query, starts_at, expires_at) where active;
create trigger cms_search_rules_touch_updated_at before update on public.cms_search_rules
for each row execute function public.cms_touch_updated_at();

create table public.cms_search_documents (
  item_id uuid primary key references public.cms_content_items (id) on delete cascade,
  revision_id uuid not null references public.cms_content_revisions (id) on delete restrict,
  content_type text not null check (content_type in ('product','service','industry','application','solution','post','page','homepage')),
  slug text not null,
  public_path text not null check (public_path ~ '^/'),
  title text not null,
  summary text,
  searchable_text text not null,
  facets jsonb not null default '{}'::jsonb check (jsonb_typeof(facets) = 'object'),
  technical_ranges jsonb not null default '{}'::jsonb check (jsonb_typeof(technical_ranges) = 'object'),
  search_document tsvector generated always as (to_tsvector('simple', searchable_text)) stored,
  source_etag text not null,
  indexed_at timestamptz not null default now(),
  unique (content_type, slug)
);
create index cms_search_documents_fts_idx on public.cms_search_documents using gin (search_document);
create index cms_search_documents_title_trgm_idx on public.cms_search_documents using gin (title extensions.gin_trgm_ops);
create index cms_search_documents_facets_idx on public.cms_search_documents using gin (facets jsonb_path_ops);
create index cms_search_documents_type_idx on public.cms_search_documents (content_type, indexed_at desc);

create function public.cms_invalidate_search_document() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    delete from public.cms_search_documents where item_id = old.item_id;
    return old;
  end if;
  delete from public.cms_search_documents where item_id = new.item_id;
  return new;
end;
$$;
create trigger cms_projection_invalidate_search
after insert or update of revision_id, slug, payload or delete on public.cms_published_projection
for each row execute function public.cms_invalidate_search_document();

create function public.cms_prune_stale_search_documents() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deleted integer;
begin
  delete from public.cms_search_documents document
  where not exists (
    select 1 from public.cms_published_projection projection
    where projection.item_id = document.item_id and projection.etag = document.source_etag
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create table public.cms_search_index_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  reason text not null check (char_length(reason) between 3 and 500),
  requested_by uuid references auth.users (id) on delete set null,
  correlation_id uuid not null,
  documents_indexed integer not null default 0 check (documents_indexed >= 0),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index cms_search_index_single_active_idx on public.cms_search_index_jobs ((true))
where status in ('pending','running');

create table public.cms_quality_rulesets (
  version text primary key check (version ~ '^v[0-9]+$'),
  status text not null check (status in ('draft','active','retired')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
insert into public.cms_quality_rulesets (version, status, definition)
values ('v1','active','{"deterministic":true,"categories":["seo","accessibility","links","media","content","pim"]}'::jsonb)
on conflict (version) do nothing;

create table public.cms_quality_runs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete cascade,
  revision_id uuid references public.cms_content_revisions (id) on delete set null,
  ruleset_version text not null references public.cms_quality_rulesets (version) on delete restrict,
  trigger_kind text not null check (trigger_kind in ('manual','publish','schedule','release')),
  status text not null check (status in ('passed','warning','blocked')),
  finding_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(finding_counts) = 'object'),
  actor_id uuid references auth.users (id) on delete set null,
  correlation_id uuid not null,
  checked_at timestamptz not null default now()
);
create index cms_quality_runs_item_idx on public.cms_quality_runs (item_id, checked_at desc);

create table public.cms_quality_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cms_quality_runs (id) on delete cascade,
  rule_key text not null check (rule_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  category text not null check (category in ('seo','accessibility','links','media','content','pim')),
  severity text not null check (severity in ('error','warning','recommendation')),
  field_path text not null check (char_length(field_path) between 1 and 300),
  message text not null check (char_length(message) between 3 and 500),
  waived boolean not null default false,
  created_at timestamptz not null default now()
);
create index cms_quality_findings_run_idx on public.cms_quality_findings (run_id, severity, category);

create table public.cms_quality_waivers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.cms_content_items (id) on delete cascade,
  rule_key text not null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index cms_quality_waivers_active_idx on public.cms_quality_waivers (item_id, rule_key, expires_at desc);

create table public.cms_quality_command_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action in ('run','waive')),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb check (response is null or jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, action, idempotency_key)
);

create function public.cms_record_quality_run(
  p_item_id uuid,
  p_revision_id uuid,
  p_trigger_kind text,
  p_status text,
  p_counts jsonb,
  p_findings jsonb,
  p_actor_id uuid,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_run_id uuid; v_checked_at timestamptz;
begin
  if p_trigger_kind not in ('manual','publish','schedule','release')
     or p_status not in ('passed','warning','blocked')
     or jsonb_typeof(p_counts) <> 'object'
     or jsonb_typeof(p_findings) <> 'array' then
    raise exception 'CMS_QUALITY_RUN_INVALID' using errcode = '22023';
  end if;
  insert into public.cms_quality_runs (
    item_id, revision_id, ruleset_version, trigger_kind, status,
    finding_counts, actor_id, correlation_id
  ) values (
    p_item_id, p_revision_id, 'v1', p_trigger_kind, p_status,
    p_counts, p_actor_id, p_correlation_id
  ) returning id, checked_at into v_run_id, v_checked_at;
  insert into public.cms_quality_findings (
    run_id, rule_key, category, severity, field_path, message, waived
  )
  select v_run_id, entry->>'ruleKey', entry->>'category', entry->>'severity',
    entry->>'fieldPath', entry->>'message', coalesce((entry->>'waived')::boolean, false)
  from jsonb_array_elements(p_findings) entry;
  return jsonb_build_object('runId', v_run_id, 'checkedAt', v_checked_at);
end;
$$;

create function public.cms_search_v2(
  p_query text,
  p_content_types text[] default '{}',
  p_facets jsonb default '{}'::jsonb,
  p_ranges jsonb default '{}'::jsonb,
  p_limit integer default 24,
  p_offset integer default 0
) returns table (
  item_id uuid, revision_id uuid, content_type text, slug text, public_path text,
  title text, summary text, score real, matched_by text, facets jsonb, technical_ranges jsonb, total_count bigint
)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with input as (
    select trim(lower(coalesce(p_query,''))) as q
  ), matching_synonyms as (
    select synonym.canonical_term, synonym.aliases, synonym.scope
    from public.cms_search_synonyms synonym cross join input
    where synonym.active and now() >= synonym.starts_at
      and (synonym.expires_at is null or synonym.expires_at > now())
      and (input.q = synonym.canonical_term or input.q = any(synonym.aliases)
        or position(synonym.canonical_term in input.q) > 0
        or exists (select 1 from unnest(synonym.aliases) alias where position(alias in input.q) > 0))
  ), terms as (
    select q as term, true as direct, 'all'::text as scope from input where q <> ''
    union select canonical_term, false, scope from matching_synonyms
    union select unnest(aliases), false, scope from matching_synonyms
  ), candidates as (
    select d.*,
      case when input.q = '' then 1.0
           when lower(d.title) = input.q then 100.0
           else (coalesce(matched.text_rank,0) * 20 + coalesce(matched.title_similarity,0) * 10)::real end as rank_score,
      case when lower(d.title) = input.q then 'exact_title'
           when matched.direct_match then 'full_text'
           when matched.synonym_match then 'governed_synonym'
           else 'similar_title' end as reason
    from public.cms_search_documents d cross join input
    cross join lateral (
      select max(ts_rank_cd(d.search_document, plainto_tsquery('simple', terms.term))) as text_rank,
        max(similarity(lower(d.title), terms.term)) as title_similarity,
        bool_or(terms.direct and d.search_document @@ plainto_tsquery('simple', terms.term)) as direct_match,
        bool_or(not terms.direct and d.search_document @@ plainto_tsquery('simple', terms.term)) as synonym_match,
        bool_or(d.search_document @@ plainto_tsquery('simple', terms.term) or similarity(lower(d.title), terms.term) >= 0.18) as matches
      from terms where terms.term <> '' and (terms.scope = 'all' or terms.scope = d.content_type)
    ) matched
    where (cardinality(p_content_types) = 0 or d.content_type = any(p_content_types))
      and (input.q = '' or matched.matches)
      and not exists (
        select 1 from jsonb_each(p_facets) requested
        where not exists (
          select 1
          from jsonb_array_elements_text(coalesce(d.facets -> requested.key, '[]'::jsonb)) available(value)
          where available.value in (
            select selected.value
            from jsonb_array_elements_text(
              case when jsonb_typeof(requested.value) = 'array' then requested.value else '[]'::jsonb end
            ) selected(value)
          )
        )
      )
      and not exists (
        select 1 from jsonb_each(p_ranges) requested
        where not exists (
          select 1 from jsonb_array_elements(coalesce(d.technical_ranges -> requested.key, '[]'::jsonb)) available
          where (requested.value->>'unit' is null or available->>'unit' = requested.value->>'unit')
            and (requested.value->>'min' is null or (available->>'max')::numeric >= (requested.value->>'min')::numeric)
            and (requested.value->>'max' is null or (available->>'min')::numeric <= (requested.value->>'max')::numeric)
        )
      )
  ), governed as (
    select candidates.*,
      case rule.rule_kind when 'pin' then 1000 when 'bury' then -1000 else 0 end as governance_boost
    from candidates
    left join lateral (
      select governed_rule.rule_kind from public.cms_search_rules governed_rule
      where governed_rule.target_item_id = candidates.item_id
        and governed_rule.normalized_query = (select q from input) and governed_rule.active
        and now() between governed_rule.starts_at and governed_rule.expires_at
      order by governed_rule.updated_at desc limit 1
    ) rule on true
  )
  select governed.item_id, governed.revision_id, governed.content_type, governed.slug, governed.public_path,
    governed.title, governed.summary, (governed.rank_score + governed.governance_boost)::real,
    governed.reason, governed.facets, governed.technical_ranges, count(*) over()
  from governed order by governed.rank_score + governed.governance_boost desc, governed.title
  limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;

alter table public.cms_search_rules enable row level security;
alter table public.cms_search_documents enable row level security;
alter table public.cms_search_index_jobs enable row level security;
alter table public.cms_quality_rulesets enable row level security;
alter table public.cms_quality_runs enable row level security;
alter table public.cms_quality_findings enable row level security;
alter table public.cms_quality_waivers enable row level security;
alter table public.cms_quality_command_receipts enable row level security;

create policy cms_search_rules_read on public.cms_search_rules for select to authenticated using (public.cms_has_permission('cms:search.read'));
create policy cms_search_jobs_read on public.cms_search_index_jobs for select to authenticated using (public.cms_has_permission('cms:search.read'));
create policy cms_quality_rulesets_read on public.cms_quality_rulesets for select to authenticated using (public.cms_has_permission('cms:quality.read'));
create policy cms_quality_runs_read on public.cms_quality_runs for select to authenticated using (public.cms_has_permission('cms:quality.read'));
create policy cms_quality_findings_read on public.cms_quality_findings for select to authenticated using (public.cms_has_permission('cms:quality.read'));
create policy cms_quality_waivers_read on public.cms_quality_waivers for select to authenticated using (public.cms_has_permission('cms:quality.read'));

revoke all on public.cms_search_rules, public.cms_search_documents, public.cms_search_index_jobs,
  public.cms_quality_rulesets, public.cms_quality_runs, public.cms_quality_findings, public.cms_quality_waivers
  , public.cms_quality_command_receipts
  from public, anon, authenticated;
grant select on public.cms_search_rules, public.cms_search_index_jobs, public.cms_quality_rulesets,
  public.cms_quality_runs, public.cms_quality_findings, public.cms_quality_waivers to authenticated;
grant all on public.cms_search_rules, public.cms_search_documents, public.cms_search_index_jobs,
  public.cms_quality_rulesets, public.cms_quality_runs, public.cms_quality_findings, public.cms_quality_waivers to service_role;
grant all on public.cms_quality_command_receipts to service_role;
revoke all on function public.cms_search_v2(text,text[],jsonb,jsonb,integer,integer) from public, anon, authenticated;
grant execute on function public.cms_search_v2(text,text[],jsonb,jsonb,integer,integer) to service_role;
revoke all on function public.cms_record_quality_run(uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.cms_record_quality_run(uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) to service_role;
revoke all on function public.cms_invalidate_search_document() from public, anon, authenticated;
revoke all on function public.cms_prune_stale_search_documents() from public, anon, authenticated;
grant execute on function public.cms_prune_stale_search_documents() to service_role;
