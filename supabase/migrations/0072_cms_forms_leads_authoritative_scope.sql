-- Authoritative QA/corporate segregation for governed forms, captured leads,
-- consent/history/export records and lead delivery.  QA classification is
-- persisted from the immutable server-side lease; client text and metadata are
-- never authorization inputs.

alter table public.cms_form_definitions
  add column if not exists qa_actor_id uuid,
  add column if not exists qa_run_tag text,
  add column if not exists qa_candidate_sha text,
  add column if not exists qa_environment text;

alter table public.cms_leads
  add column if not exists capture_hash text,
  add column if not exists qa_actor_id uuid,
  add column if not exists qa_run_tag text,
  add column if not exists qa_candidate_sha text,
  add column if not exists qa_environment text;

alter table public.cms_lead_exports
  add column if not exists qa_actor_id uuid,
  add column if not exists qa_run_tag text,
  add column if not exists qa_candidate_sha text,
  add column if not exists qa_environment text;

create or replace function private.cms_lead_capture_hash(
  p_form_id uuid,
  p_form_version_id uuid,
  p_fields jsonb,
  p_origin jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'formId', p_form_id,
          'formVersionId', p_form_version_id,
          'fields', coalesce(p_fields, '{}'::jsonb),
          'origin', jsonb_strip_nulls(jsonb_build_object(
            'path', p_origin ->> 'path',
            'source', p_origin ->> 'source',
            'campaignId', p_origin ->> 'campaignId',
            'productId', p_origin ->> 'productId',
            'utm', coalesce(p_origin -> 'utm', '{}'::jsonb)
          ))
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- Classify every legacy row that can be proven to have been created inside an
-- exact QA lease.  Ambiguous historical rows remain fail-closed: an ever-QA
-- creator prevents corporate visibility, while missing provenance prevents QA
-- visibility.
update public.cms_form_definitions form
set qa_actor_id = lease.actor_id,
    qa_run_tag = lease.run_tag,
    qa_candidate_sha = lease.candidate_sha,
    qa_environment = lease.environment
from private.cms_qa_actor_leases lease
where form.created_by = lease.actor_id
  and form.created_at between lease.created_at and lease.expires_at
  and private.cms_qa_actor_marker_is_exact(
    lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
  )
  and form.qa_actor_id is null;

update public.cms_leads lead
set qa_actor_id = form.qa_actor_id,
    qa_run_tag = form.qa_run_tag,
    qa_candidate_sha = form.qa_candidate_sha,
    qa_environment = form.qa_environment
from public.cms_form_definitions form
where form.id = lead.form_id
  and form.qa_actor_id is not null
  and lead.created_at between (
    select lease.created_at
    from private.cms_qa_actor_leases lease
    where lease.actor_id = form.qa_actor_id
  ) and (
    select lease.expires_at
    from private.cms_qa_actor_leases lease
    where lease.actor_id = form.qa_actor_id
  )
  and lead.qa_actor_id is null;

update public.cms_leads lead
set capture_hash = private.cms_lead_capture_hash(
  lead.form_id,
  lead.form_version_id,
  lead.payload,
  jsonb_strip_nulls(jsonb_build_object(
    'path', lead.origin_path,
    'source', lead.origin_source,
    'campaignId', lead.campaign_id,
    'productId', lead.product_id,
    'utm', lead.utm
  ))
)
where lead.capture_hash is null;

update public.cms_lead_exports exported
set qa_actor_id = lease.actor_id,
    qa_run_tag = lease.run_tag,
    qa_candidate_sha = lease.candidate_sha,
    qa_environment = lease.environment
from private.cms_qa_actor_leases lease
where exported.actor_id = lease.actor_id
  and exported.created_at between lease.created_at and lease.expires_at
  and private.cms_qa_actor_marker_is_exact(
    lease.actor_id, lease.run_tag, lease.candidate_sha, lease.environment
  )
  and exported.qa_actor_id is null;

alter table public.cms_leads alter column capture_hash set not null;

alter table public.cms_form_definitions
  drop constraint if exists cms_form_definitions_qa_provenance_check;
alter table public.cms_form_definitions
  add constraint cms_form_definitions_qa_provenance_check check (
    (
      qa_actor_id is null and qa_run_tag is null
      and qa_candidate_sha is null and qa_environment is null
    ) or (
      num_nonnulls(qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment) = 4
      and qa_actor_id = created_by
      and qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and qa_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(qa_run_tag, 9) = ('-' || left(qa_candidate_sha, 8))
      and qa_environment in ('staging', 'production')
    )
  ) not valid;
alter table public.cms_form_definitions
  validate constraint cms_form_definitions_qa_provenance_check;

alter table public.cms_leads
  drop constraint if exists cms_leads_capture_hash_check;
alter table public.cms_leads
  add constraint cms_leads_capture_hash_check
  check (capture_hash ~ '^[0-9a-f]{64}$') not valid;
alter table public.cms_leads validate constraint cms_leads_capture_hash_check;

alter table public.cms_leads
  drop constraint if exists cms_leads_qa_provenance_check;
alter table public.cms_leads
  add constraint cms_leads_qa_provenance_check check (
    (
      qa_actor_id is null and qa_run_tag is null
      and qa_candidate_sha is null and qa_environment is null
    ) or (
      num_nonnulls(qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment) = 4
      and
      qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and qa_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(qa_run_tag, 9) = ('-' || left(qa_candidate_sha, 8))
      and qa_environment in ('staging', 'production')
    )
  ) not valid;
alter table public.cms_leads validate constraint cms_leads_qa_provenance_check;

alter table public.cms_lead_exports
  drop constraint if exists cms_lead_exports_qa_provenance_check;
alter table public.cms_lead_exports
  add constraint cms_lead_exports_qa_provenance_check check (
    (
      qa_actor_id is null and qa_run_tag is null
      and qa_candidate_sha is null and qa_environment is null
    ) or (
      num_nonnulls(qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment) = 4
      and qa_actor_id = actor_id
      and qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
      and qa_candidate_sha ~ '^[0-9a-f]{40}$'
      and right(qa_run_tag, 9) = ('-' || left(qa_candidate_sha, 8))
      and qa_environment in ('staging', 'production')
    )
  ) not valid;
alter table public.cms_lead_exports
  validate constraint cms_lead_exports_qa_provenance_check;

create index if not exists cms_form_definitions_qa_actor_idx
  on public.cms_form_definitions (qa_actor_id, updated_at desc)
  where qa_actor_id is not null;
create index if not exists cms_leads_qa_actor_idx
  on public.cms_leads (qa_actor_id, created_at desc)
  where qa_actor_id is not null;
create index if not exists cms_lead_exports_qa_actor_idx
  on public.cms_lead_exports (qa_actor_id, created_at desc)
  where qa_actor_id is not null;

create or replace function private.cms_forms_actor_environment(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private, pg_temp
as $$
  select coalesce(
    (select lease.environment from private.cms_qa_actor_leases lease
     where lease.actor_id = p_actor_id),
    'local'
  );
$$;

create or replace function private.cms_form_scope_allowed(
  p_actor_id uuid,
  p_form_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_form_definitions form
    where form.id = p_form_id
      and p_environment in ('local', 'staging', 'production')
      and private.cms_content_actor_context_active(p_actor_id, p_environment)
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, form.created_by, form.created_at, p_environment
      )
      and private.cms_content_actor_row_scope_allowed(
        p_actor_id, form.updated_by, form.updated_at, p_environment
      )
      and (
        (
          exists (select 1 from private.cms_qa_actor_leases caller
                  where caller.actor_id = p_actor_id)
          and exists (
            select 1
            from private.cms_qa_actor_leases caller
            join private.cms_qa_actor_leases owner
              on owner.actor_id = form.qa_actor_id
             and owner.run_tag = caller.run_tag
             and owner.candidate_sha = caller.candidate_sha
             and owner.environment = caller.environment
            where caller.actor_id = p_actor_id
              and caller.environment = p_environment
              and caller.status = 'active'
              and owner.status = 'active'
              and caller.expires_at > statement_timestamp()
              and owner.expires_at > statement_timestamp()
              and form.qa_actor_id = form.created_by
              and form.qa_run_tag = owner.run_tag
              and form.qa_candidate_sha = owner.candidate_sha
              and form.qa_environment = owner.environment
              and form.created_at between owner.created_at and owner.expires_at
              and private.cms_qa_actor_marker_is_exact(
                caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
              )
              and private.cms_qa_actor_marker_is_exact(
                owner.actor_id, owner.run_tag, owner.candidate_sha, owner.environment
              )
          )
        ) or (
          not exists (select 1 from private.cms_qa_actor_leases caller
                      where caller.actor_id = p_actor_id)
          and form.qa_actor_id is null
          and form.qa_run_tag is null
          and form.qa_candidate_sha is null
          and form.qa_environment is null
        )
      )
      and not exists (
        select 1
        from public.cms_form_versions version
        where version.form_id = form.id
          and not private.cms_content_actor_row_scope_allowed(
            p_actor_id, version.created_by, version.created_at, p_environment
          )
      )
  );
$$;

create or replace function private.cms_form_public_allowed(
  p_form_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select exists (
    select 1
    from public.cms_form_definitions form
    where form.id = p_form_id
      and p_environment in ('local', 'staging', 'production')
      and (
        (
          form.qa_actor_id is null
          and form.qa_run_tag is null
          and form.qa_candidate_sha is null
          and form.qa_environment is null
          and not exists (select 1 from private.cms_qa_actor_leases lease
                          where lease.actor_id in (form.created_by, form.updated_by))
          and not exists (
            select 1
            from public.cms_form_versions version
            join private.cms_qa_actor_leases lease on lease.actor_id = version.created_by
            where version.form_id = form.id
          )
        ) or exists (
          select 1
          from private.cms_qa_actor_leases owner
          where owner.actor_id = form.qa_actor_id
            and form.qa_actor_id = form.created_by
            and form.qa_run_tag = owner.run_tag
            and form.qa_candidate_sha = owner.candidate_sha
            and form.qa_environment = owner.environment
            and owner.environment = p_environment
            and owner.status = 'active'
            and owner.expires_at > statement_timestamp()
            and form.created_at between owner.created_at and owner.expires_at
            and private.cms_qa_actor_marker_is_exact(
              owner.actor_id, owner.run_tag, owner.candidate_sha, owner.environment
            )
            and private.cms_content_actor_row_scope_allowed(
              owner.actor_id, form.updated_by, form.updated_at, owner.environment
            )
            and not exists (
              select 1
              from public.cms_form_versions version
              where version.form_id = form.id
                and not private.cms_content_actor_row_scope_allowed(
                  owner.actor_id, version.created_by, version.created_at, owner.environment
                )
            )
        )
      )
  );
$$;

create or replace function private.cms_lead_assignee_allowed(
  p_actor_id uuid,
  p_assigned_to uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select p_assigned_to is null or exists (
    select 1
    from public.cms_profiles profile
    where profile.user_id = p_assigned_to
      and profile.status = 'active'
      and private.cms_content_actor_context_active(p_actor_id, p_environment)
      and (
        (
          exists (select 1 from private.cms_qa_actor_leases caller
                  where caller.actor_id = p_actor_id)
          and exists (
            select 1
            from private.cms_qa_actor_leases caller
            join private.cms_qa_actor_leases assignee
              on assignee.actor_id = profile.user_id
             and assignee.run_tag = caller.run_tag
             and assignee.candidate_sha = caller.candidate_sha
             and assignee.environment = caller.environment
            where caller.actor_id = p_actor_id
              and caller.environment = p_environment
              and caller.status = 'active'
              and assignee.status = 'active'
              and caller.expires_at > statement_timestamp()
              and assignee.expires_at > statement_timestamp()
              and private.cms_qa_actor_marker_is_exact(
                caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
              )
              and private.cms_qa_actor_marker_is_exact(
                assignee.actor_id, assignee.run_tag, assignee.candidate_sha, assignee.environment
              )
          )
        ) or (
          not exists (select 1 from private.cms_qa_actor_leases caller
                      where caller.actor_id = p_actor_id)
          and not exists (select 1 from private.cms_qa_actor_leases target
                          where target.actor_id = profile.user_id)
        )
      )
  );
$$;

create or replace function private.cms_lead_scope_allowed(
  p_actor_id uuid,
  p_lead_id uuid,
  p_environment text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_leads lead
    join public.cms_form_definitions form on form.id = lead.form_id
    where lead.id = p_lead_id
      and private.cms_form_scope_allowed(p_actor_id, form.id, p_environment)
      and (
        (
          exists (select 1 from private.cms_qa_actor_leases caller
                  where caller.actor_id = p_actor_id)
          and exists (
            select 1
            from private.cms_qa_actor_leases caller
            join private.cms_qa_actor_leases owner
              on owner.actor_id = lead.qa_actor_id
             and owner.run_tag = caller.run_tag
             and owner.candidate_sha = caller.candidate_sha
             and owner.environment = caller.environment
            where caller.actor_id = p_actor_id
              and caller.environment = p_environment
              and caller.status = 'active'
              and owner.status = 'active'
              and caller.expires_at > statement_timestamp()
              and owner.expires_at > statement_timestamp()
              and lead.qa_actor_id = form.qa_actor_id
              and lead.qa_run_tag = form.qa_run_tag
              and lead.qa_candidate_sha = form.qa_candidate_sha
              and lead.qa_environment = form.qa_environment
              and lead.created_at between owner.created_at and owner.expires_at
              and private.cms_qa_actor_marker_is_exact(
                caller.actor_id, caller.run_tag, caller.candidate_sha, caller.environment
              )
              and private.cms_qa_actor_marker_is_exact(
                owner.actor_id, owner.run_tag, owner.candidate_sha, owner.environment
              )
          )
        ) or (
          not exists (select 1 from private.cms_qa_actor_leases caller
                      where caller.actor_id = p_actor_id)
          and lead.qa_actor_id is null
          and lead.qa_run_tag is null
          and lead.qa_candidate_sha is null
          and lead.qa_environment is null
        )
      )
      and private.cms_lead_assignee_allowed(
        p_actor_id, lead.assigned_to, p_environment
      )
      and not exists (
        select 1
        from public.cms_lead_status_history history
        where history.lead_id = lead.id
          and (
            (history.actor_id is not null and not private.cms_lead_assignee_allowed(
              p_actor_id, history.actor_id, p_environment
            ))
            or (history.from_assignee is not null and not private.cms_lead_assignee_allowed(
              p_actor_id, history.from_assignee, p_environment
            ))
            or (history.to_assignee is not null and not private.cms_lead_assignee_allowed(
              p_actor_id, history.to_assignee, p_environment
            ))
          )
      )
      and not exists (
        select 1
        from public.cms_lead_outbox_replays replay
        where replay.lead_id = lead.id
          and not private.cms_lead_assignee_allowed(
            p_actor_id, replay.requested_by, p_environment
          )
      )
  );
$$;

create or replace function private.cms_lead_external_delivery_allowed(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from public.cms_leads lead
    join public.cms_form_definitions form on form.id = lead.form_id
    join public.cms_form_versions version
      on version.id = lead.form_version_id and version.form_id = form.id
    where lead.id = p_lead_id
      and lead.anonymized_at is null
      and lead.qa_actor_id is null
      and lead.qa_run_tag is null
      and lead.qa_candidate_sha is null
      and lead.qa_environment is null
      and form.qa_actor_id is null
      and form.qa_run_tag is null
      and form.qa_candidate_sha is null
      and form.qa_environment is null
      and lead.origin_source <> 'qa_fixture'
      and lead.origin_path !~ '^/qa-cms-final/'
      and lead.origin_path !~ '^/campanhas/qa-lead-qa-cms-final-'
      and not exists (
        select 1 from private.cms_qa_actor_leases lease
        where lease.actor_id in (
          form.created_by, form.updated_by, version.created_by, lead.assigned_to
        )
      )
      and not exists (
        select 1
        from public.cms_lead_status_history history
        join private.cms_qa_actor_leases lease
          on lease.actor_id in (
            history.actor_id, history.from_assignee, history.to_assignee
          )
        where history.lead_id = lead.id
      )
      and not exists (
        select 1
        from public.cms_lead_outbox_replays replay
        join private.cms_qa_actor_leases lease on lease.actor_id = replay.requested_by
        where replay.lead_id = lead.id
      )
      and (
        lead.campaign_id is null
        or private.cms_content_item_graph_scope_allowed(
          form.created_by, lead.campaign_id, 'local'
        )
      )
      and (
        lead.product_id is null
        or private.cms_content_item_graph_scope_allowed(
          form.created_by, lead.product_id, 'local'
        )
      )
  );
$$;

-- Public capture is deliberately narrower for QA.  A synthetic form can only
-- receive the browser fixture route owned by its exact lease or a published
-- same-run campaign that binds the exact form/version pair.
create or replace function private.cms_form_capture_origin_allowed(
  p_form_id uuid,
  p_form_version_id uuid,
  p_origin jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_campaign public.cms_content_items%rowtype;
  v_projection public.cms_published_projection%rowtype;
  v_path text := p_origin ->> 'path';
  v_source text := p_origin ->> 'source';
  v_campaign_id uuid;
  v_product_id uuid;
begin
  if jsonb_typeof(p_origin) is distinct from 'object'
     or nullif(v_path, '') is null
     or v_path !~ '^/'
     or nullif(v_source, '') is null
     or p_environment not in ('local', 'staging', 'production') then
    return false;
  end if;
  begin
    v_campaign_id := nullif(p_origin ->> 'campaignId', '')::uuid;
    v_product_id := nullif(p_origin ->> 'productId', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  select * into v_form
  from public.cms_form_definitions form
  where form.id = p_form_id
    and form.status = 'published'
    and form.active_version_id = p_form_version_id;
  if not found or not private.cms_form_public_allowed(p_form_id, p_environment) then
    return false;
  end if;

  if v_form.qa_actor_id is null then
    return v_source <> 'qa_fixture'
      and v_path !~ '^/qa-cms-final/'
      and v_path !~ '^/campanhas/qa-lead-qa-cms-final-'
      and (v_campaign_id is null or private.cms_content_item_graph_scope_allowed(
        v_form.created_by, v_campaign_id, 'local'
      ))
      and (v_product_id is null or private.cms_content_item_graph_scope_allowed(
        v_form.created_by, v_product_id, 'local'
      ));
  end if;

  if v_source = 'qa_fixture' then
    return v_campaign_id is null
      and v_product_id is null
      and v_path = '/qa-cms-final/' || lower(v_form.qa_run_tag);
  end if;
  if v_source <> 'campaign'
     or v_campaign_id is null
     or v_path !~ (
       '^/campanhas/qa-lead-' || lower(v_form.qa_run_tag) || '-[0-9a-f]{8}$'
     ) then
    return false;
  end if;
  select * into v_campaign
  from public.cms_content_items item
  where item.id = v_campaign_id and item.content_type = 'campaign';
  if not found
     or not private.cms_content_item_graph_scope_allowed(
       v_form.qa_actor_id, v_campaign.id, p_environment
     ) then
    return false;
  end if;
  select * into v_projection
  from public.cms_published_projection projection
  where projection.item_id = v_campaign.id
    and projection.content_type = 'campaign'
    and projection.payload #>> '{route,path}' = v_path
    and projection.payload #>> '{form,formId}' = p_form_id::text
    and projection.payload #>> '{form,versionId}' = p_form_version_id::text;
  if not found then return false; end if;
  return v_product_id is null or private.cms_content_item_graph_scope_allowed(
    v_form.qa_actor_id, v_product_id, p_environment
  );
end;
$$;

create or replace function private.cms_form_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_environment text;
  v_command_actor_text text := nullif(current_setting('cms.qa_mutation_actor_id', true), '');
  v_command_actor uuid;
begin
  if v_command_actor_text is not null
     and v_command_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_command_actor := v_command_actor_text::uuid;
  end if;
  if tg_op = 'INSERT' then
    if v_command_actor is distinct from new.created_by
       or new.updated_by is distinct from new.created_by then
      raise exception 'CMS_FORM_ACTOR_CONTEXT_REQUIRED' using errcode = '42501';
    end if;
    perform private.cms_lock_active_qa_actor_leases(array[new.created_by]);
    select * into v_lease from private.cms_qa_actor_leases lease
    where lease.actor_id = new.created_by;
    if found then
      if not private.cms_qa_actor_marker_is_exact(
           v_lease.actor_id, v_lease.run_tag, v_lease.candidate_sha, v_lease.environment
         ) or new.created_at not between v_lease.created_at and v_lease.expires_at then
        raise exception 'CMS_FORM_QA_PROVENANCE_INVALID' using errcode = '42501';
      end if;
      new.qa_actor_id := v_lease.actor_id;
      new.qa_run_tag := v_lease.run_tag;
      new.qa_candidate_sha := v_lease.candidate_sha;
      new.qa_environment := v_lease.environment;
    elsif new.qa_actor_id is not null or new.qa_run_tag is not null
       or new.qa_candidate_sha is not null or new.qa_environment is not null then
      raise exception 'CMS_FORM_QA_PROVENANCE_SPOOFED' using errcode = '42501';
    end if;
    return new;
  end if;

  if row(new.qa_actor_id, new.qa_run_tag, new.qa_candidate_sha, new.qa_environment, new.created_by)
     is distinct from
     row(old.qa_actor_id, old.qa_run_tag, old.qa_candidate_sha, old.qa_environment, old.created_by) then
    raise exception 'CMS_FORM_QA_PROVENANCE_IMMUTABLE' using errcode = '55000';
  end if;
  v_environment := coalesce(old.qa_environment, private.cms_forms_actor_environment(new.updated_by));
  if old.qa_actor_id is not null then
    if new.updated_by <> old.qa_actor_id
       and not private.cms_content_actor_row_scope_allowed(
         old.qa_actor_id, new.updated_by, statement_timestamp(), old.qa_environment
       ) then
      raise exception 'CMS_FORM_CROSS_SCOPE_MUTATION_FORBIDDEN' using errcode = '42501';
    end if;
  elsif exists (
    select 1 from private.cms_qa_actor_leases lease where lease.actor_id = new.updated_by
  ) then
    raise exception 'CMS_FORM_CROSS_SCOPE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;
  if v_command_actor is not null and v_command_actor <> new.updated_by then
    raise exception 'CMS_FORM_ACTOR_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_form_version_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_environment text;
  v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select form.qa_actor_id into v_owner from public.cms_form_definitions form
  where form.id = new.form_id;
  perform private.cms_lock_active_qa_actor_leases(array[v_owner, new.created_by]);
  select * into v_form from public.cms_form_definitions form
  where form.id = new.form_id for update;
  if not found then
    raise exception 'CMS_FORM_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_environment := coalesce(v_form.qa_environment, private.cms_forms_actor_environment(new.created_by));
  if not private.cms_form_scope_allowed(new.created_by, v_form.id, v_environment) then
    raise exception 'CMS_FORM_VERSION_CROSS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_lead_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_expected_hash text;
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select form.qa_actor_id into v_owner from public.cms_form_definitions form
    where form.id = new.form_id;
    perform private.cms_lock_active_qa_actor_leases(array[v_owner]);
    select * into v_form from public.cms_form_definitions form
    where form.id = new.form_id for update;
    if not found or v_form.active_version_id <> new.form_version_id then
      raise exception 'CMS_FORM_VERSION_INACTIVE' using errcode = '23514';
    end if;
    v_expected_hash := private.cms_lead_capture_hash(
      new.form_id,
      new.form_version_id,
      new.payload,
      jsonb_strip_nulls(jsonb_build_object(
        'path', new.origin_path,
        'source', new.origin_source,
        'campaignId', new.campaign_id,
        'productId', new.product_id,
        'utm', new.utm
      ))
    );
    if new.capture_hash is not null and new.capture_hash <> v_expected_hash then
      raise exception 'CMS_LEAD_CAPTURE_HASH_SPOOFED' using errcode = '42501';
    end if;
    new.capture_hash := v_expected_hash;
    new.qa_actor_id := v_form.qa_actor_id;
    new.qa_run_tag := v_form.qa_run_tag;
    new.qa_candidate_sha := v_form.qa_candidate_sha;
    new.qa_environment := v_form.qa_environment;
    if not private.cms_form_capture_origin_allowed(
      new.form_id,
      new.form_version_id,
      jsonb_strip_nulls(jsonb_build_object(
        'path', new.origin_path,
        'source', new.origin_source,
        'campaignId', new.campaign_id,
        'productId', new.product_id,
        'utm', new.utm
      )),
      coalesce(v_form.qa_environment, 'production')
    ) then
      raise exception 'CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
    if not private.cms_lead_assignee_allowed(
      v_form.created_by, new.assigned_to, coalesce(v_form.qa_environment, 'local')
    ) then
      raise exception 'CMS_LEAD_ASSIGNEE_SCOPE_FORBIDDEN' using errcode = '42501';
    end if;
    return new;
  end if;

  if row(
       new.form_id, new.form_version_id, new.idempotency_key, new.capture_hash,
       new.origin_path, new.origin_source, new.campaign_id, new.product_id,
       new.qa_actor_id, new.qa_run_tag, new.qa_candidate_sha, new.qa_environment,
       new.created_at
     ) is distinct from row(
       old.form_id, old.form_version_id, old.idempotency_key, old.capture_hash,
       old.origin_path, old.origin_source, old.campaign_id, old.product_id,
       old.qa_actor_id, old.qa_run_tag, old.qa_candidate_sha, old.qa_environment,
       old.created_at
     ) then
    raise exception 'CMS_LEAD_PROVENANCE_IMMUTABLE' using errcode = '55000';
  end if;
  select * into v_form from public.cms_form_definitions form where form.id = old.form_id;
  if not found or not private.cms_lead_assignee_allowed(
    v_form.created_by, new.assigned_to, coalesce(old.qa_environment, 'local')
  ) then
    raise exception 'CMS_LEAD_ASSIGNEE_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_lead_child_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_lead_id uuid := nullif(v_row ->> 'lead_id', '')::uuid;
  v_lead public.cms_leads%rowtype;
  v_form public.cms_form_definitions%rowtype;
  v_actor uuid;
begin
  if current_setting('cms.qa_compensating', true) = 'on' then
    return new;
  end if;
  select * into v_lead from public.cms_leads lead where lead.id = v_lead_id for update;
  if not found then raise exception 'CMS_LEAD_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_form from public.cms_form_definitions form where form.id = v_lead.form_id;
  v_actor := coalesce(
    nullif(v_row ->> 'actor_id', '')::uuid,
    nullif(v_row ->> 'requested_by', '')::uuid
  );
  if (v_actor is not null and not private.cms_lead_assignee_allowed(
       v_form.created_by, v_actor, coalesce(v_lead.qa_environment, 'local')
     ))
     or not private.cms_lead_assignee_allowed(
       v_form.created_by,
       nullif(v_row ->> 'from_assignee', '')::uuid,
       coalesce(v_lead.qa_environment, 'local')
     )
     or not private.cms_lead_assignee_allowed(
       v_form.created_by,
       nullif(v_row ->> 'to_assignee', '')::uuid,
       coalesce(v_lead.qa_environment, 'local')
     ) then
    raise exception 'CMS_LEAD_CHILD_CROSS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.cms_lead_export_provenance_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_lease private.cms_qa_actor_leases%rowtype;
begin
  perform private.cms_lock_active_qa_actor_leases(array[new.actor_id]);
  select * into v_lease from private.cms_qa_actor_leases lease
  where lease.actor_id = new.actor_id;
  if found then
    if not private.cms_qa_actor_marker_is_exact(
      v_lease.actor_id, v_lease.run_tag, v_lease.candidate_sha, v_lease.environment
    ) then raise exception 'CMS_LEAD_EXPORT_SCOPE_FORBIDDEN' using errcode = '42501'; end if;
    new.qa_actor_id := v_lease.actor_id;
    new.qa_run_tag := v_lease.run_tag;
    new.qa_candidate_sha := v_lease.candidate_sha;
    new.qa_environment := v_lease.environment;
  elsif new.qa_actor_id is not null or new.qa_run_tag is not null
     or new.qa_candidate_sha is not null or new.qa_environment is not null then
    raise exception 'CMS_LEAD_EXPORT_PROVENANCE_SPOOFED' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cms_form_provenance_guard on public.cms_form_definitions;
create trigger cms_form_provenance_guard
before insert or update on public.cms_form_definitions
for each row execute function private.cms_form_provenance_guard();
drop trigger if exists cms_form_version_scope_guard on public.cms_form_versions;
create trigger cms_form_version_scope_guard
before insert or update on public.cms_form_versions
for each row execute function private.cms_form_version_scope_guard();
drop trigger if exists cms_lead_provenance_guard on public.cms_leads;
create trigger cms_lead_provenance_guard
before insert or update on public.cms_leads
for each row execute function private.cms_lead_provenance_guard();
drop trigger if exists cms_lead_consent_scope_guard on public.cms_lead_consents;
create trigger cms_lead_consent_scope_guard before insert on public.cms_lead_consents
for each row execute function private.cms_lead_child_scope_guard();
drop trigger if exists cms_lead_history_scope_guard on public.cms_lead_status_history;
create trigger cms_lead_history_scope_guard before insert on public.cms_lead_status_history
for each row execute function private.cms_lead_child_scope_guard();
drop trigger if exists cms_lead_outbox_scope_guard on public.cms_lead_outbox;
create trigger cms_lead_outbox_scope_guard before insert on public.cms_lead_outbox
for each row execute function private.cms_lead_child_scope_guard();
drop trigger if exists cms_lead_replay_scope_guard on public.cms_lead_outbox_replays;
create trigger cms_lead_replay_scope_guard before insert on public.cms_lead_outbox_replays
for each row execute function private.cms_lead_child_scope_guard();
drop trigger if exists cms_lead_export_provenance_guard on public.cms_lead_exports;
create trigger cms_lead_export_provenance_guard before insert on public.cms_lead_exports
for each row execute function private.cms_lead_export_provenance_guard();

create or replace function public.cms_form_session_read_allowed(p_form_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_form_scope_allowed(
    auth.uid(), p_form_id, private.cms_forms_actor_environment(auth.uid())
  );
$$;
create or replace function public.cms_lead_session_read_allowed(p_lead_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_lead_scope_allowed(
    auth.uid(), p_lead_id, private.cms_forms_actor_environment(auth.uid())
  );
$$;
create or replace function public.cms_lead_actor_session_read_allowed(
  p_actor_id uuid,
  p_created_at timestamptz
)
returns boolean language sql stable security definer
set search_path = pg_catalog, private, auth, pg_temp
as $$
  select private.cms_content_actor_row_scope_allowed(
    auth.uid(), p_actor_id, p_created_at, private.cms_forms_actor_environment(auth.uid())
  );
$$;

do $$
declare v_policy record;
begin
  for v_policy in
    select policy.tablename, policy.policyname
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'cms_form_definitions','cms_form_versions','cms_leads','cms_lead_consents',
        'cms_lead_status_history','cms_lead_outbox','cms_lead_outbox_replays',
        'cms_lead_exports'
      ])
  loop
    execute format('drop policy %I on public.%I', v_policy.policyname, v_policy.tablename);
  end loop;
end;
$$;

create policy cms_forms_scoped_read on public.cms_form_definitions
for select to authenticated using (
  public.cms_has_permission('cms:forms.read')
  and public.cms_form_session_read_allowed(id)
);
create policy cms_form_versions_scoped_read on public.cms_form_versions
for select to authenticated using (
  public.cms_has_permission('cms:forms.read')
  and public.cms_form_session_read_allowed(form_id)
);
create policy cms_leads_scoped_read on public.cms_leads
for select to authenticated using (
  public.cms_has_permission('cms:leads.read')
  and public.cms_lead_session_read_allowed(id)
);
create policy cms_lead_consents_scoped_read on public.cms_lead_consents
for select to authenticated using (
  public.cms_has_permission('cms:leads.read')
  and public.cms_lead_session_read_allowed(lead_id)
);
create policy cms_lead_history_scoped_read on public.cms_lead_status_history
for select to authenticated using (
  public.cms_has_permission('cms:leads.read')
  and public.cms_lead_session_read_allowed(lead_id)
);
create policy cms_lead_outbox_scoped_read on public.cms_lead_outbox
for select to authenticated using (
  public.cms_has_permission('cms:leads.read')
  and public.cms_lead_session_read_allowed(lead_id)
);
create policy cms_lead_replays_scoped_read on public.cms_lead_outbox_replays
for select to authenticated using (
  public.cms_has_permission('cms:leads.read')
  and public.cms_lead_session_read_allowed(lead_id)
);
create policy cms_lead_exports_scoped_read on public.cms_lead_exports
for select to authenticated using (
  (actor_id = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_lead_actor_session_read_allowed(actor_id, created_at)
);

-- Keep the shared EV2 receipt table safe until 0073 replaces every domain
-- policy with the generalized release/collaboration/bulk actor scope.
drop policy if exists "cms_ev2_receipts_owner_or_audit_read" on public.cms_ev2_command_receipts;
drop policy if exists cms_forms_receipts_scoped_read on public.cms_ev2_command_receipts;
create policy cms_forms_receipts_scoped_read on public.cms_ev2_command_receipts
for select to authenticated using (
  (actor_id = auth.uid() or public.cms_has_permission('cms:audit.read'))
  and public.cms_lead_actor_session_read_allowed(actor_id, created_at)
);

create or replace function private.cms_content_payload_form_scope_allowed(
  p_actor_id uuid,
  p_payload jsonb,
  p_environment text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_reference text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  for v_reference in
    select distinct value #>> '{}' from jsonb_path_query(p_payload, 'lax $.**.formId') value
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not private.cms_form_scope_allowed(p_actor_id, v_reference::uuid, p_environment) then
      return false;
    end if;
  end loop;
  for v_reference in
    select distinct value #>> '{}'
    from (
      select value from jsonb_path_query(p_payload, 'lax $.**.formVersionId') value
      union all select value from jsonb_path_query(p_payload, 'lax $.form.versionId') value
    ) versions
  loop
    if v_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.cms_form_versions version
         where version.id = v_reference::uuid
           and private.cms_form_scope_allowed(p_actor_id, version.form_id, p_environment)
       ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.cms_forms_list_scoped(
  p_actor_id uuid,
  p_environment text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_items jsonb;
begin
  if p_limit not between 1 and 500
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:forms.read', p_aal, p_session_id, p_issued_at
     )
     or not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_FORMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(scoped) order by scoped.updated_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      form.id,
      form.form_key,
      form.title,
      form.purpose,
      form.status,
      form.active_version_id,
      form.lock_version,
      form.updated_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', version.id,
            'version', version.version,
            'status', version.status,
            'definition', version.definition,
            'consent_text', version.consent_text,
            'consent_version', version.consent_version,
            'privacy_path', version.privacy_path,
            'sla_minutes', version.sla_minutes,
            'retention_days', version.retention_days,
            'created_at', version.created_at,
            'published_at', version.published_at
          ) order by version.version desc
        )
        from public.cms_form_versions version where version.form_id = form.id
      ), '[]'::jsonb) as cms_form_versions
    from public.cms_form_definitions form
    where private.cms_form_scope_allowed(p_actor_id, form.id, p_environment)
    order by form.updated_at desc
    limit p_limit
  ) scoped;
  return jsonb_build_object('schemaVersion', 1, 'items', v_items);
end;
$$;

create or replace function public.cms_leads_list_scoped(
  p_actor_id uuid,
  p_environment text,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_items jsonb; v_total bigint; v_assignees jsonb;
begin
  if p_limit not between 1 and 100
     or p_offset not between 0 and 1000000
     or (p_status is not null and p_status not in (
       'new','assigned','in_service','responded','converted','disqualified','archived','anonymized'
     ))
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:leads.read', p_aal, p_session_id, p_issued_at
     )
     or not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_LEADS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  select count(*) into v_total
  from public.cms_leads lead
  where (p_status is null or lead.status = p_status)
    and private.cms_lead_scope_allowed(p_actor_id, lead.id, p_environment);
  select coalesce(jsonb_agg(to_jsonb(scoped) order by scoped.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      lead.id, lead.reference_code, lead.status, lead.origin_path, lead.origin_source,
      lead.assigned_to, lead.sla_due_at, lead.retention_until, lead.created_at,
      lead.payload, lead.utm,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', consent.id, 'consent_version', consent.consent_version,
        'policy_path', consent.policy_path, 'server_recorded_at', consent.server_recorded_at
      ) order by consent.server_recorded_at desc)
      from public.cms_lead_consents consent where consent.lead_id = lead.id), '[]'::jsonb)
        as cms_lead_consents,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', history.id, 'from_status', history.from_status,
        'to_status', history.to_status, 'reason', history.reason,
        'created_at', history.created_at
      ) order by history.created_at desc)
      from public.cms_lead_status_history history where history.lead_id = lead.id), '[]'::jsonb)
        as cms_lead_status_history,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', outbox.id, 'event_type', outbox.event_type, 'status', outbox.status,
        'attempts', outbox.attempts, 'available_at', outbox.available_at,
        'completed_at', outbox.completed_at, 'last_error_code', outbox.last_error_code,
        'created_at', outbox.created_at
      ) order by outbox.created_at desc)
      from public.cms_lead_outbox outbox where outbox.lead_id = lead.id), '[]'::jsonb)
        as cms_lead_outbox
    from public.cms_leads lead
    where (p_status is null or lead.status = p_status)
      and private.cms_lead_scope_allowed(p_actor_id, lead.id, p_environment)
    order by lead.created_at desc
    limit p_limit offset p_offset
  ) scoped;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', profile.user_id, 'display_name', profile.display_name
  ) order by profile.display_name, profile.user_id), '[]'::jsonb)
  into v_assignees
  from public.cms_profiles profile
  where profile.status = 'active'
    and private.cms_lead_assignee_allowed(p_actor_id, profile.user_id, p_environment);
  return jsonb_build_object(
    'schemaVersion', 1, 'items', v_items, 'total', v_total, 'assignees', v_assignees
  );
end;
$$;

create or replace function public.cms_public_form_scoped(
  p_environment text,
  p_form_key text default null,
  p_form_id uuid default null,
  p_version_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select to_jsonb(result)
  from (
    select
      form.id,
      form.form_key,
      form.title,
      form.purpose,
      form.active_version_id,
      version.id as version_id,
      version.version,
      version.definition,
      version.consent_text,
      version.consent_version,
      version.privacy_path,
      version.sla_minutes,
      version.retention_days
    from public.cms_form_definitions form
    join public.cms_form_versions version
      on version.id = form.active_version_id and version.form_id = form.id
    where form.status = 'published'
      and version.status = 'published'
      and (p_form_key is null or form.form_key = p_form_key)
      and (p_form_id is null or form.id = p_form_id)
      and (p_version_id is null or version.id = p_version_id)
      and (p_form_key is not null or p_form_id is not null)
      and private.cms_form_public_allowed(form.id, p_environment)
    limit 1
  ) result;
$$;

alter function public.cms_save_form_version(
  uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) rename to cms_save_form_version_unscoped_0072;
alter function public.cms_publish_form_version(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) rename to cms_publish_form_version_unscoped_0072;
alter function public.cms_execute_form_lifecycle_command(
  uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) rename to cms_execute_form_lifecycle_command_unscoped_0072;

revoke all on function public.cms_save_form_version_unscoped_0072(
  uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_publish_form_version_unscoped_0072(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.cms_execute_form_lifecycle_command_unscoped_0072(
  uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) from public, anon, authenticated, service_role;

create or replace function public.cms_save_form_version_scoped(
  p_actor_id uuid,
  p_environment text,
  p_form_id uuid,
  p_expected_lock_version bigint,
  p_form_key text,
  p_title text,
  p_purpose text,
  p_definition jsonb,
  p_consent_text text,
  p_consent_version text,
  p_privacy_path text,
  p_sla_minutes integer,
  p_retention_days integer,
  p_reason text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_result jsonb;
  v_owner uuid;
begin
  if not public.cms_actor_authorized(
       p_actor_id, 'cms:forms.edit', p_aal, p_session_id, p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id, p_environment) then
    raise exception 'CMS_FORMS_SCOPE_FORBIDDEN' using errcode = '42501';
  end if;
  select form.created_by into v_owner from public.cms_form_definitions form
  where form.id = p_form_id;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id, v_owner]);
  if p_form_id is not null then
    select * into v_form from public.cms_form_definitions form
    where form.id = p_form_id for update;
    if not found then raise exception 'CMS_FORM_NOT_FOUND' using errcode = 'P0002'; end if;
    if not private.cms_form_scope_allowed(p_actor_id, v_form.id, p_environment) then
      raise exception 'CMS_FORM_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_expected_lock_version is null or v_form.lock_version <> p_expected_lock_version then
      raise exception 'CMS_FORM_VERSION_CONFLICT:%', v_form.lock_version using errcode = 'P0001';
    end if;
  elsif p_expected_lock_version is not null then
    raise exception 'CMS_FORM_COMMAND_INVALID' using errcode = '22023';
  end if;
  perform set_config('cms.qa_mutation_actor_id', p_actor_id::text, true);
  v_result := public.cms_save_form_version_unscoped_0072(
    p_actor_id,p_form_id,p_form_key,p_title,p_purpose,p_definition,p_consent_text,
    p_consent_version,p_privacy_path,p_sla_minutes,p_retention_days,p_reason,
    p_aal,p_session_id,p_issued_at,p_correlation_id
  );
  select * into v_form from public.cms_form_definitions form
  where form.id = (v_result ->> 'formId')::uuid;
  if not private.cms_form_scope_allowed(p_actor_id, v_form.id, p_environment) then
    raise exception 'CMS_FORM_SCOPE_POSTCONDITION_FAILED' using errcode = '55000';
  end if;
  return v_result || jsonb_build_object('lockVersion', v_form.lock_version);
end;
$$;

create or replace function public.cms_save_form_version(
  p_actor_id uuid,p_form_id uuid,p_form_key text,p_title text,p_purpose text,
  p_definition jsonb,p_consent_text text,p_consent_version text,p_privacy_path text,
  p_sla_minutes integer,p_retention_days integer,p_reason text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_expected bigint;
begin
  select form.lock_version into v_expected from public.cms_form_definitions form
  where form.id = p_form_id;
  return public.cms_save_form_version_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_form_id,v_expected,
    p_form_key,p_title,p_purpose,p_definition,p_consent_text,p_consent_version,
    p_privacy_path,p_sla_minutes,p_retention_days,p_reason,p_aal,p_session_id,
    p_issued_at,p_correlation_id
  );
end;
$$;

create or replace function public.cms_publish_form_version_scoped(
  p_actor_id uuid,p_environment text,p_form_id uuid,p_version_id uuid,
  p_expected_lock_version bigint,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare v_form public.cms_form_definitions%rowtype; v_owner uuid; v_result jsonb;
begin
  if not public.cms_actor_authorized(
       p_actor_id,'cms:forms.publish',p_aal,p_session_id,p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_FORMS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  select form.created_by into v_owner from public.cms_form_definitions form where form.id=p_form_id;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id,v_owner]);
  select * into v_form from public.cms_form_definitions form where form.id=p_form_id for update;
  if not found or not private.cms_form_scope_allowed(p_actor_id,p_form_id,p_environment) then
    raise exception 'CMS_FORM_NOT_FOUND' using errcode='P0002';
  end if;
  if p_expected_lock_version is null or v_form.lock_version<>p_expected_lock_version then
    raise exception 'CMS_FORM_VERSION_CONFLICT:%',v_form.lock_version using errcode='P0001';
  end if;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  v_result:=public.cms_publish_form_version_unscoped_0072(
    p_actor_id,p_form_id,p_version_id,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
  return v_result;
end;
$$;

create or replace function public.cms_publish_form_version(
  p_actor_id uuid,p_form_id uuid,p_version_id uuid,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_expected bigint;
begin
  select form.lock_version into v_expected from public.cms_form_definitions form where form.id=p_form_id;
  return public.cms_publish_form_version_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_form_id,p_version_id,
    v_expected,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
end;
$$;

create or replace function public.cms_execute_form_lifecycle_command_scoped(
  p_actor_id uuid,p_environment text,p_action text,p_form_id uuid,
  p_source_version_id uuid,p_expected_lock_version bigint,p_reason text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_idempotency_key uuid,
  p_request_hash text,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_owner uuid;
  v_receipt public.cms_ev2_command_receipts%rowtype;
begin
  if not public.cms_actor_authorized(
       p_actor_id,'cms:forms.publish',p_aal,p_session_id,p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_FORMS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  select form.created_by into v_owner from public.cms_form_definitions form where form.id=p_form_id;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id,v_owner]);
  select * into v_form from public.cms_form_definitions form where form.id=p_form_id for update;
  if not found or not private.cms_form_scope_allowed(p_actor_id,p_form_id,p_environment) then
    raise exception 'CMS_FORM_NOT_FOUND' using errcode='P0002';
  end if;
  select * into v_receipt from public.cms_ev2_command_receipts receipt
  where receipt.actor_id=p_actor_id
    and receipt.domain='forms'
    and receipt.action=p_action
    and receipt.idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.request_hash<>p_request_hash then
      raise exception 'CMS_FORM_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    if v_receipt.response is null then
      raise exception 'CMS_FORM_IDEMPOTENCY_CONFLICT_IN_PROGRESS' using errcode='40001';
    end if;
    return v_receipt.response || jsonb_build_object('replayed',true);
  end if;
  if p_expected_lock_version is null or v_form.lock_version<>p_expected_lock_version then
    raise exception 'CMS_FORM_VERSION_CONFLICT:%',v_form.lock_version using errcode='P0001';
  end if;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_execute_form_lifecycle_command_unscoped_0072(
    p_actor_id,p_action,p_form_id,p_source_version_id,p_expected_lock_version,
    p_reason,p_aal,p_session_id,p_issued_at,p_idempotency_key,p_request_hash,p_correlation_id
  );
end;
$$;

create or replace function public.cms_execute_form_lifecycle_command(
  p_actor_id uuid,p_action text,p_form_id uuid,p_source_version_id uuid,
  p_expected_lock_version bigint,p_reason text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_idempotency_key uuid,p_request_hash text,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
begin
  return public.cms_execute_form_lifecycle_command_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_action,p_form_id,
    p_source_version_id,p_expected_lock_version,p_reason,p_aal,p_session_id,p_issued_at,
    p_idempotency_key,p_request_hash,p_correlation_id
  );
end;
$$;

alter function public.cms_capture_lead(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid)
  rename to cms_capture_lead_unscoped_0072;
revoke all on function public.cms_capture_lead_unscoped_0072(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid
) from public, anon, authenticated, service_role;

create or replace function public.cms_capture_lead_scoped(
  p_environment text,
  p_form_id uuid,
  p_form_version_id uuid,
  p_idempotency_key uuid,
  p_fields jsonb,
  p_origin jsonb,
  p_consent jsonb,
  p_technical_evidence jsonb,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_form public.cms_form_definitions%rowtype;
  v_existing public.cms_leads%rowtype;
  v_result jsonb;
  v_capture_hash text;
  v_evidence jsonb;
begin
  if p_environment not in ('local','staging','production')
     or p_idempotency_key is null
     or p_correlation_id is null then
    raise exception 'CMS_LEAD_CAPTURE_INVALID' using errcode='22023';
  end if;
  select * into v_form from public.cms_form_definitions form where form.id=p_form_id;
  if not found then raise exception 'CMS_FORM_VERSION_INACTIVE' using errcode='23514'; end if;
  perform private.cms_lock_active_qa_actor_leases(array[v_form.qa_actor_id,v_form.created_by]);
  select * into v_form from public.cms_form_definitions form where form.id=p_form_id for update;
  if not private.cms_form_capture_origin_allowed(
       p_form_id,p_form_version_id,p_origin,p_environment
     ) then
    raise exception 'CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  v_capture_hash:=private.cms_lead_capture_hash(
    p_form_id,p_form_version_id,p_fields,p_origin
  );
  select * into v_existing from public.cms_leads lead
  where lead.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.form_id<>p_form_id
       or v_existing.form_version_id<>p_form_version_id
       or v_existing.capture_hash<>v_capture_hash
       or v_existing.qa_actor_id is distinct from v_form.qa_actor_id
       or v_existing.qa_run_tag is distinct from v_form.qa_run_tag
       or v_existing.qa_candidate_sha is distinct from v_form.qa_candidate_sha
       or v_existing.qa_environment is distinct from v_form.qa_environment then
      raise exception 'CMS_LEAD_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
  end if;
  if v_form.qa_actor_id is null then
    v_evidence:=coalesce(p_technical_evidence,'{}'::jsonb)
      - 'synthetic' - 'runTag' - 'candidateSha' - 'environment';
  else
    -- QA evidence is intentionally delivery-safe and contains no supplied IP,
    -- user-agent, token, prompt or arbitrary metadata.
    v_evidence:=jsonb_build_object(
      'synthetic',true,
      'runTag',v_form.qa_run_tag,
      'candidateSha',v_form.qa_candidate_sha,
      'environment',v_form.qa_environment
    );
  end if;
  v_result:=public.cms_capture_lead_unscoped_0072(
    p_form_id,p_form_version_id,p_idempotency_key,p_fields,p_origin,p_consent,
    v_evidence,p_correlation_id
  );
  select * into v_existing from public.cms_leads lead
  where lead.id=(v_result->>'leadId')::uuid;
  if not found
     or v_existing.capture_hash<>v_capture_hash
     or v_existing.qa_actor_id is distinct from v_form.qa_actor_id
     or v_existing.qa_run_tag is distinct from v_form.qa_run_tag
     or v_existing.qa_candidate_sha is distinct from v_form.qa_candidate_sha
     or v_existing.qa_environment is distinct from v_form.qa_environment then
    raise exception 'CMS_LEAD_CAPTURE_POSTCONDITION_FAILED' using errcode='55000';
  end if;
  return v_result;
end;
$$;

create or replace function public.cms_capture_lead(
  p_form_id uuid,p_form_version_id uuid,p_idempotency_key uuid,p_fields jsonb,
  p_origin jsonb,p_consent jsonb,p_technical_evidence jsonb,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_environment text;
begin
  select coalesce(form.qa_environment,'production') into v_environment
  from public.cms_form_definitions form where form.id=p_form_id;
  return public.cms_capture_lead_scoped(
    coalesce(v_environment,'production'),p_form_id,p_form_version_id,p_idempotency_key,
    p_fields,p_origin,p_consent,p_technical_evidence,p_correlation_id
  );
end;
$$;

alter function public.cms_manage_lead(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid)
  rename to cms_manage_lead_unscoped_0072;
alter function public.cms_export_leads(uuid,text,text,text,text,timestamptz,uuid)
  rename to cms_export_leads_unscoped_0072;
alter function public.cms_anonymize_lead(uuid,uuid,text,text,text,timestamptz,uuid)
  rename to cms_anonymize_lead_unscoped_0072;
revoke all on function public.cms_manage_lead_unscoped_0072(
  uuid,uuid,text,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_export_leads_unscoped_0072(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.cms_anonymize_lead_unscoped_0072(
  uuid,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated,service_role;

create or replace function public.cms_manage_lead_scoped(
  p_actor_id uuid,p_environment text,p_lead_id uuid,p_status text,p_assigned_to uuid,
  p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_lead public.cms_leads%rowtype;
  v_form public.cms_form_definitions%rowtype;
  v_form_id uuid;
  v_owner uuid;
  v_old_assignee uuid;
begin
  if not public.cms_actor_authorized(
       p_actor_id,'cms:leads.assign',p_aal,p_session_id,p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_LEADS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  select lead.form_id,form.created_by,lead.assigned_to
  into v_form_id,v_owner,v_old_assignee
  from public.cms_leads lead join public.cms_form_definitions form on form.id=lead.form_id
  where lead.id=p_lead_id;
  perform private.cms_lock_active_qa_actor_leases(
    array[p_actor_id,v_owner,v_old_assignee,p_assigned_to]
  );
  select * into v_form from public.cms_form_definitions form where form.id=v_form_id for update;
  select * into v_lead from public.cms_leads lead where lead.id=p_lead_id for update;
  if not found or not private.cms_lead_scope_allowed(p_actor_id,p_lead_id,p_environment) then
    raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002';
  end if;
  if not private.cms_lead_assignee_allowed(p_actor_id,p_assigned_to,p_environment) then
    raise exception 'CMS_LEAD_ASSIGNEE_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_manage_lead_unscoped_0072(
    p_actor_id,p_lead_id,p_status,p_assigned_to,p_reason,p_aal,p_session_id,
    p_issued_at,p_correlation_id
  );
end;
$$;

create or replace function public.cms_manage_lead(
  p_actor_id uuid,p_lead_id uuid,p_status text,p_assigned_to uuid,p_reason text,
  p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language sql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select public.cms_manage_lead_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_lead_id,p_status,
    p_assigned_to,p_reason,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
$$;

create or replace function public.cms_anonymize_lead_scoped(
  p_actor_id uuid,p_environment text,p_lead_id uuid,p_reason text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_form_id uuid; v_owner uuid; v_assignee uuid;
begin
  if not public.cms_actor_authorized(
       p_actor_id,'cms:leads.privacy',p_aal,p_session_id,p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_LEADS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  select lead.form_id,form.created_by,lead.assigned_to into v_form_id,v_owner,v_assignee
  from public.cms_leads lead join public.cms_form_definitions form on form.id=lead.form_id
  where lead.id=p_lead_id;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id,v_owner,v_assignee]);
  perform 1 from public.cms_form_definitions form where form.id=v_form_id for update;
  perform 1 from public.cms_leads lead where lead.id=p_lead_id for update;
  if not found or not private.cms_lead_scope_allowed(p_actor_id,p_lead_id,p_environment) then
    raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002';
  end if;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_anonymize_lead_unscoped_0072(
    p_actor_id,p_lead_id,p_reason,p_aal,p_session_id,p_issued_at,p_correlation_id
  );
end;
$$;

create or replace function public.cms_anonymize_lead(
  p_actor_id uuid,p_lead_id uuid,p_reason text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language sql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select public.cms_anonymize_lead_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_lead_id,p_reason,
    p_aal,p_session_id,p_issued_at,p_correlation_id
  );
$$;

create or replace function public.cms_export_leads_scoped(
  p_actor_id uuid,p_environment text,p_status text,p_justification text,p_aal text,
  p_session_id text,p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_rows jsonb; v_count integer;
begin
  if char_length(btrim(coalesce(p_justification,''))) not between 3 and 500
     or (p_status is not null and p_status not in (
       'new','assigned','in_service','responded','converted','disqualified','archived'
     ))
     or not public.cms_actor_authorized(
       p_actor_id,'cms:leads.export',p_aal,p_session_id,p_issued_at
     ) or not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_LEAD_EXPORT_FORBIDDEN' using errcode='42501';
  end if;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id]);
  select coalesce(jsonb_agg(jsonb_build_object(
    'reference',exported.reference_code,'status',exported.status,
    'createdAt',exported.created_at,'originPath',exported.origin_path,
    'originSource',exported.origin_source,'utm',exported.utm,'fields',exported.payload
  ) order by exported.created_at desc),'[]'::jsonb),count(*)
  into v_rows,v_count
  from (
    select lead.reference_code,lead.status,lead.created_at,lead.origin_path,
      lead.origin_source,lead.utm,lead.payload
    from public.cms_leads lead
    where lead.anonymized_at is null
      and (p_status is null or lead.status=p_status)
      and private.cms_lead_scope_allowed(p_actor_id,lead.id,p_environment)
    order by lead.created_at desc limit 5000
  ) exported;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  insert into public.cms_lead_exports(
    actor_id,filter_snapshot,row_count,justification,correlation_id
  ) values (
    p_actor_id,jsonb_build_object('status',p_status,'limit',5000,'environment',p_environment),
    v_count,btrim(p_justification),p_correlation_id
  );
  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values (
    p_actor_id,'cms:leads.export','lead_export',p_correlation_id::text,
    jsonb_build_object('rowCount',v_count,'status',p_status,'environment',p_environment),
    p_correlation_id
  );
  return jsonb_build_object(
    'rows',v_rows,'rowCount',v_count,'correlationId',p_correlation_id
  );
end;
$$;

create or replace function public.cms_export_leads(
  p_actor_id uuid,p_status text,p_justification text,p_aal text,p_session_id text,
  p_issued_at timestamptz,p_correlation_id uuid
)
returns jsonb language sql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select public.cms_export_leads_scoped(
    p_actor_id,private.cms_forms_actor_environment(p_actor_id),p_status,p_justification,
    p_aal,p_session_id,p_issued_at,p_correlation_id
  );
$$;

alter function public.cms_retry_lead_delivery(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) rename to cms_retry_lead_delivery_unscoped_0072;
revoke all on function public.cms_retry_lead_delivery_unscoped_0072(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated,service_role;

create or replace function public.cms_retry_lead_delivery_scoped(
  p_actor_id uuid,p_event_id uuid,p_justification text,p_environment text,
  p_site_key text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_correlation_id uuid,p_idempotency_key uuid,p_request_hash text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_form_id uuid; v_lead_id uuid; v_owner uuid; v_assignee uuid;
begin
  if not private.cms_content_actor_context_active(p_actor_id,p_environment) then
    raise exception 'CMS_LEADS_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  select lead.form_id,lead.id,form.created_by,lead.assigned_to
  into v_form_id,v_lead_id,v_owner,v_assignee
  from public.cms_lead_outbox event
  join public.cms_leads lead on lead.id=event.lead_id
  join public.cms_form_definitions form on form.id=lead.form_id
  where event.id=p_event_id;
  perform private.cms_lock_active_qa_actor_leases(array[p_actor_id,v_owner,v_assignee]);
  perform 1 from public.cms_form_definitions form where form.id=v_form_id for update;
  perform 1 from public.cms_leads lead where lead.id=v_lead_id for update;
  perform 1 from public.cms_lead_outbox event where event.id=p_event_id for update;
  if not found or not private.cms_lead_scope_allowed(p_actor_id,v_lead_id,p_environment) then
    raise exception 'CMS_LEAD_DELIVERY_NOT_FOUND' using errcode='PT404';
  end if;
  perform set_config('cms.qa_mutation_actor_id',p_actor_id::text,true);
  return public.cms_retry_lead_delivery_unscoped_0072(
    p_actor_id,p_event_id,p_justification,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_correlation_id,p_idempotency_key,p_request_hash
  );
end;
$$;

create or replace function public.cms_retry_lead_delivery(
  p_actor_id uuid,p_event_id uuid,p_justification text,p_environment text,
  p_site_key text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_correlation_id uuid,p_idempotency_key uuid,p_request_hash text
)
returns jsonb language sql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select public.cms_retry_lead_delivery_scoped(
    p_actor_id,p_event_id,p_justification,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_correlation_id,p_idempotency_key,p_request_hash
  );
$$;

create or replace function public.cms_retry_lead_delivery_limited(
  p_actor_id uuid,p_event_id uuid,p_justification text,p_environment text,
  p_site_key text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_correlation_id uuid,p_idempotency_key uuid,p_request_hash text,
  p_rate_limit_key_hash text
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
begin
  if p_rate_limit_key_hash is null or p_rate_limit_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CMS_RATE_LIMIT_KEY_INVALID' using errcode='22023';
  end if;
  if public.consume_rate_limit(
       p_rate_limit_key_hash,'cms_leads_retry_delivery',60,900
     ) is not true then
    raise exception 'CMS_RATE_LIMIT_EXCEEDED' using errcode='PT429';
  end if;
  return public.cms_retry_lead_delivery_scoped(
    p_actor_id,p_event_id,p_justification,p_environment,p_site_key,p_aal,p_session_id,
    p_issued_at,p_correlation_id,p_idempotency_key,p_request_hash
  );
end;
$$;

create or replace function private.cms_lead_system_scope(p_lead_id uuid)
returns text
language sql
stable
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select case when exists (
    select 1
    from public.cms_leads lead
    join public.cms_form_definitions form on form.id=lead.form_id
    join public.cms_form_versions version
      on version.id=lead.form_version_id and version.form_id=form.id
    where lead.id=p_lead_id
      and (
        lead.qa_actor_id is not null
        or form.qa_actor_id is not null
        or exists (
          select 1 from private.cms_qa_actor_leases lease
          where lease.actor_id in (
            form.created_by,form.updated_by,version.created_by,lead.assigned_to
          )
        )
        or exists (
          select 1
          from public.cms_lead_status_history history
          join private.cms_qa_actor_leases lease
            on lease.actor_id in (
              history.actor_id,history.from_assignee,history.to_assignee
            )
          where history.lead_id=lead.id
        )
        or exists (
          select 1
          from public.cms_lead_outbox_replays replay
          join private.cms_qa_actor_leases lease on lease.actor_id=replay.requested_by
          where replay.lead_id=lead.id
        )
      )
  ) then 'qa' else 'corporate' end;
$$;

alter function public.cms_apply_lead_retention(integer,uuid)
  rename to cms_apply_lead_retention_unscoped_0072;
revoke all on function public.cms_apply_lead_retention_unscoped_0072(integer,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.cms_apply_lead_retention_scoped(
  p_limit integer,p_correlation_id uuid,p_scope text
)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_candidate_id uuid;
  v_lead public.cms_leads%rowtype;
  v_form public.cms_form_definitions%rowtype;
  v_lease_actor_ids uuid[];
  v_affected integer:=0;
begin
  if p_limit not between 1 and 500 or p_correlation_id is null
     or p_scope not in ('corporate','qa') then
    raise exception 'CMS_LEAD_RETENTION_SCOPE_INVALID' using errcode='22023';
  end if;
  for v_candidate_id in
    select lead.id
    from public.cms_leads lead
    where lead.retention_until<=statement_timestamp()
      and lead.anonymized_at is null
      and private.cms_lead_system_scope(lead.id)=p_scope
    order by lead.retention_until,lead.id
    limit p_limit
  loop
    select form,array_remove(array[
      form.qa_actor_id,form.created_by,form.updated_by,
      lead.qa_actor_id,lead.assigned_to
    ],null)
    into v_form,v_lease_actor_ids
    from public.cms_leads lead
    join public.cms_form_definitions form on form.id=lead.form_id
    where lead.id=v_candidate_id;
    perform 1
    from private.cms_qa_actor_leases lease
    where lease.actor_id=any(coalesce(v_lease_actor_ids,'{}'::uuid[]))
    order by lease.actor_id
    for share;
    select lead,form into v_lead,v_form
    from public.cms_leads lead
    join public.cms_form_definitions form on form.id=lead.form_id
    where lead.id=v_candidate_id
      and lead.retention_until<=statement_timestamp()
      and lead.anonymized_at is null
      and private.cms_lead_system_scope(lead.id)=p_scope
    for update of form,lead;
    if not found then continue; end if;
    update public.cms_leads lead
    set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',
      anonymized_at=statement_timestamp(),last_activity_at=statement_timestamp()
    where lead.id=v_lead.id;
    insert into public.cms_lead_status_history(
      lead_id,from_status,to_status,reason
    ) values (
      v_lead.id,v_lead.status,'anonymized','Retencao automatica aplicada'
    );
    v_affected:=v_affected+1;
  end loop;
  insert into public.cms_operational_events(
    severity,event_type,correlation_id,error_code
  ) values (
    'info','cms.leads.retention_applied.'||p_scope,p_correlation_id,
    'rows_'||v_affected::text
  );
  return v_affected;
end;
$$;

create or replace function public.cms_apply_lead_retention(
  p_limit integer,p_correlation_id uuid
)
returns integer
language sql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select public.cms_apply_lead_retention_scoped(
    p_limit,p_correlation_id,'corporate'
  );
$$;

alter function public.cms_enqueue_lead_sla_breaches(integer,uuid)
  rename to cms_enqueue_lead_sla_breaches_unscoped_0072;
revoke all on function public.cms_enqueue_lead_sla_breaches_unscoped_0072(integer,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.cms_enqueue_lead_sla_breaches(
  p_limit integer,p_correlation_id uuid
)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare v_due record; v_affected integer:=0;
begin
  if p_limit not between 1 and 500 or p_correlation_id is null then
    raise exception 'CMS_LEAD_SLA_COMMAND_INVALID' using errcode='22023';
  end if;
  for v_due in
    select lead.id
    from public.cms_leads lead
    where lead.status in ('new','assigned','in_service')
      and lead.sla_due_at<=statement_timestamp()
      and lead.sla_notified_at is null
      and private.cms_lead_system_scope(lead.id)='corporate'
    order by lead.sla_due_at,lead.id
    for update skip locked
    limit p_limit
  loop
    update public.cms_leads lead
    set sla_notified_at=statement_timestamp()
    where lead.id=v_due.id
      and lead.sla_notified_at is null
      and private.cms_lead_system_scope(lead.id)='corporate';
    if not found then continue; end if;
    insert into public.cms_lead_outbox(
      lead_id,event_type,idempotency_key,correlation_id
    ) values (
      v_due.id,'sla_breached',gen_random_uuid(),p_correlation_id
    );
    v_affected:=v_affected+1;
  end loop;
  return v_affected;
end;
$$;

alter function public.cms_claim_lead_outbox(integer)
  rename to cms_claim_lead_outbox_unscoped_0072;
revoke all on function public.cms_claim_lead_outbox_unscoped_0072(integer)
  from public,anon,authenticated,service_role;

create or replace function public.cms_claim_lead_outbox_scoped(p_limit integer)
returns table(
  id uuid,lead_id uuid,event_type text,status text,idempotency_key uuid,
  attempts integer,available_at timestamptz,locked_at timestamptz,
  completed_at timestamptz,last_error_code text,correlation_id uuid,
  created_at timestamptz,delivery_allowed boolean,reference_code text
)
language sql
volatile
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
  select
    event.id,event.lead_id,event.event_type,event.status,event.idempotency_key,
    event.attempts,event.available_at,event.locked_at,event.completed_at,
    event.last_error_code,event.correlation_id,event.created_at,
    private.cms_lead_external_delivery_allowed(event.lead_id),
    case when private.cms_lead_external_delivery_allowed(event.lead_id)
      then lead.reference_code else null end
  from public.cms_claim_lead_outbox_unscoped_0072(p_limit) event
  join public.cms_leads lead on lead.id=event.lead_id;
$$;

create or replace function private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  v_form_ids uuid[];
  v_version_ids uuid[];
  v_lead_ids uuid[];
  v_outbox_ids uuid[];
  v_forms integer:=0;
  v_versions integer:=0;
  v_leads integer:=0;
  v_outbox integer:=0;
  v_previous_compensating text;
  v_previous_actor text;
begin
  if old.status<>'active'
     or new.status not in ('cleaned','expired')
     or new.status=old.status then
    return new;
  end if;
  select coalesce(array_agg(form.id order by form.id),'{}'::uuid[])
  into v_form_ids from public.cms_form_definitions form
  where form.qa_actor_id=old.actor_id
    and form.qa_run_tag=old.run_tag
    and form.qa_candidate_sha=old.candidate_sha
    and form.qa_environment=old.environment;
  select coalesce(array_agg(version.id order by version.id),'{}'::uuid[])
  into v_version_ids from public.cms_form_versions version
  where version.form_id=any(v_form_ids);
  select coalesce(array_agg(lead.id order by lead.id),'{}'::uuid[])
  into v_lead_ids from public.cms_leads lead
  where lead.form_id=any(v_form_ids);
  select coalesce(array_agg(outbox.id order by outbox.id),'{}'::uuid[])
  into v_outbox_ids from public.cms_lead_outbox outbox
  where outbox.lead_id=any(v_lead_ids);

  perform 1 from public.cms_form_definitions form
  where form.id=any(v_form_ids) order by form.id for update;
  perform 1 from public.cms_form_versions version
  where version.id=any(v_version_ids) order by version.id for update;
  perform 1 from public.cms_leads lead
  where lead.id=any(v_lead_ids) order by lead.id for update;
  perform 1 from public.cms_lead_outbox outbox
  where outbox.id=any(v_outbox_ids) order by outbox.id for update;

  if exists (
    select 1 from public.cms_form_definitions form where form.id=any(v_form_ids)
      and (form.qa_actor_id<>old.actor_id or form.qa_run_tag<>old.run_tag
        or form.qa_candidate_sha<>old.candidate_sha or form.qa_environment<>old.environment)
  ) or exists (
    select 1 from public.cms_leads lead where lead.id=any(v_lead_ids)
      and lead.qa_actor_id is not null
      and row(
        lead.qa_actor_id,lead.qa_run_tag,lead.qa_candidate_sha,lead.qa_environment
      ) is distinct from row(
        old.actor_id,old.run_tag,old.candidate_sha,old.environment
      )
  ) then
    raise exception 'CMS_QA_FORMS_LEADS_CLEANUP_SCOPE_CONFLICT' using errcode='40001';
  end if;

  v_previous_compensating:=current_setting('cms.qa_compensating',true);
  v_previous_actor:=current_setting('cms.qa_mutation_actor_id',true);
  perform set_config('cms.qa_compensating','on',true);
  perform set_config('cms.qa_mutation_actor_id',old.actor_id::text,true);
  begin
    insert into public.cms_lead_status_history(
      lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id
    )
    select lead.id,lead.status,'anonymized',lead.assigned_to,null,
      'QA synthetic lease terminal cleanup',old.actor_id
    from public.cms_leads lead
    where lead.id=any(v_lead_ids) and lead.anonymized_at is null;

    update public.cms_leads lead
    set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',
      anonymized_at=clock_timestamp(),last_activity_at=clock_timestamp()
    where lead.id=any(v_lead_ids) and lead.anonymized_at is null;
    get diagnostics v_leads=row_count;

    update public.cms_lead_outbox outbox
    set status='completed',locked_at=null,
      completed_at=coalesce(outbox.completed_at,clock_timestamp()),last_error_code=null
    where outbox.id=any(v_outbox_ids) and outbox.status<>'completed';
    get diagnostics v_outbox=row_count;

    update public.cms_form_versions version
    set status='retired',published_at=coalesce(version.published_at,clock_timestamp())
    where version.id=any(v_version_ids) and version.status<>'retired';
    get diagnostics v_versions=row_count;

    update public.cms_form_definitions form
    set status='retired',active_version_id=null,updated_by=old.actor_id
    where form.id=any(v_form_ids)
      and (form.status<>'retired' or form.active_version_id is not null);
    get diagnostics v_forms=row_count;
  exception when others then
    perform set_config(
      'cms.qa_compensating',coalesce(nullif(v_previous_compensating,''),'off'),true
    );
    perform set_config(
      'cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true
    );
    raise;
  end;
  perform set_config(
    'cms.qa_compensating',coalesce(nullif(v_previous_compensating,''),'off'),true
  );
  perform set_config('cms.qa_mutation_actor_id',coalesce(v_previous_actor,''),true);

  if exists (
       select 1 from public.cms_leads lead
       where lead.id=any(v_lead_ids) and lead.anonymized_at is null
     ) or exists (
       select 1 from public.cms_lead_outbox outbox
       where outbox.id=any(v_outbox_ids)
         and outbox.status in ('pending','processing','failed','dead_letter')
     ) or exists (
       select 1 from public.cms_form_definitions form
       where form.id=any(v_form_ids)
         and (form.status<>'retired' or form.active_version_id is not null)
     ) then
    raise exception 'CMS_QA_FORMS_LEADS_CLEANUP_INCOMPLETE' using errcode='55000';
  end if;

  insert into public.cms_audit_log(
    actor_id,action,target_type,target_id,event_data,correlation_id
  ) values (
    old.actor_id,'cms:qa.forms_leads.cleanup','qa_actor_lease',old.actor_id::text,
    jsonb_build_object(
      'runTag',old.run_tag,'formsRetired',v_forms,'versionsRetired',v_versions,
      'leadsAnonymized',v_leads,'outboxTerminalized',v_outbox,'terminalStatus',new.status
    ),old.correlation_id
  );
  return new;
end;
$$;

drop trigger if exists zzz_cms_forms_leads_terminal_cleanup
  on private.cms_qa_actor_leases;
create trigger zzz_cms_forms_leads_terminal_cleanup
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_prepare_qa_actor_terminal_forms_leads_cleanup();

revoke all on function public.cms_forms_list_scoped(
  uuid,text,text,text,timestamptz,integer
) from public,anon,authenticated;
revoke all on function public.cms_leads_list_scoped(
  uuid,text,text,integer,integer,text,text,timestamptz
) from public,anon,authenticated;
revoke all on function public.cms_public_form_scoped(text,text,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.cms_save_form_version_scoped(
  uuid,text,uuid,bigint,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_publish_form_version_scoped(
  uuid,text,uuid,uuid,bigint,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_execute_form_lifecycle_command_scoped(
  uuid,text,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) from public,anon,authenticated;
revoke all on function public.cms_capture_lead_scoped(
  text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid
) from public,anon,authenticated;
revoke all on function public.cms_manage_lead_scoped(
  uuid,text,uuid,text,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_anonymize_lead_scoped(
  uuid,text,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_export_leads_scoped(
  uuid,text,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated;
revoke all on function public.cms_claim_lead_outbox_scoped(integer)
  from public,anon,authenticated;
revoke all on function public.cms_apply_lead_retention_scoped(integer,uuid,text)
  from public,anon,authenticated;

grant execute on function public.cms_forms_list_scoped(
  uuid,text,text,text,timestamptz,integer
) to service_role;
grant execute on function public.cms_leads_list_scoped(
  uuid,text,text,integer,integer,text,text,timestamptz
) to service_role;
grant execute on function public.cms_public_form_scoped(text,text,uuid,uuid)
  to service_role;
grant execute on function public.cms_save_form_version_scoped(
  uuid,text,uuid,bigint,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_publish_form_version_scoped(
  uuid,text,uuid,uuid,bigint,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_execute_form_lifecycle_command_scoped(
  uuid,text,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) to service_role;
grant execute on function public.cms_capture_lead_scoped(
  text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid
) to service_role;
grant execute on function public.cms_manage_lead_scoped(
  uuid,text,uuid,text,uuid,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_anonymize_lead_scoped(
  uuid,text,uuid,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_export_leads_scoped(
  uuid,text,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_retry_lead_delivery_scoped(
  uuid,uuid,text,text,text,text,text,timestamptz,uuid,uuid,text
) to service_role;
grant execute on function public.cms_claim_lead_outbox_scoped(integer)
  to service_role;
grant execute on function public.cms_apply_lead_retention_scoped(integer,uuid,text)
  to service_role;

revoke all on function public.cms_save_form_version(
  uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_publish_form_version(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_execute_form_lifecycle_command(
  uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) from public,anon,authenticated;
revoke all on function public.cms_capture_lead(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid
) from public,anon,authenticated;
revoke all on function public.cms_manage_lead(
  uuid,uuid,text,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_anonymize_lead(
  uuid,uuid,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_export_leads(
  uuid,text,text,text,text,timestamptz,uuid
) from public,anon,authenticated;
revoke all on function public.cms_retry_lead_delivery(
  uuid,uuid,text,text,text,text,timestamptz,uuid,uuid,text
) from public,anon,authenticated;
revoke all on function public.cms_retry_lead_delivery_limited(
  uuid,uuid,text,text,text,text,timestamptz,uuid,uuid,text,text
) from public,anon,authenticated;
revoke all on function public.cms_apply_lead_retention(integer,uuid)
  from public,anon,authenticated;
revoke all on function public.cms_enqueue_lead_sla_breaches(integer,uuid)
  from public,anon,authenticated;

grant execute on function public.cms_save_form_version(
  uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_publish_form_version(
  uuid,uuid,uuid,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_execute_form_lifecycle_command(
  uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid
) to service_role;
grant execute on function public.cms_capture_lead(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid
) to service_role;
grant execute on function public.cms_manage_lead(
  uuid,uuid,text,uuid,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_anonymize_lead(
  uuid,uuid,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_export_leads(
  uuid,text,text,text,text,timestamptz,uuid
) to service_role;
grant execute on function public.cms_retry_lead_delivery(
  uuid,uuid,text,text,text,text,timestamptz,uuid,uuid,text
) to service_role;
grant execute on function public.cms_retry_lead_delivery_limited(
  uuid,uuid,text,text,text,text,timestamptz,uuid,uuid,text,text
) to service_role;
grant execute on function public.cms_apply_lead_retention(integer,uuid)
  to service_role;
grant execute on function public.cms_enqueue_lead_sla_breaches(integer,uuid)
  to service_role;

revoke all on function public.cms_form_session_read_allowed(uuid)
  from public,anon;
revoke all on function public.cms_lead_session_read_allowed(uuid)
  from public,anon;
revoke all on function public.cms_lead_actor_session_read_allowed(uuid,timestamptz)
  from public,anon;
grant execute on function public.cms_form_session_read_allowed(uuid) to authenticated;
grant execute on function public.cms_lead_session_read_allowed(uuid) to authenticated;
grant execute on function public.cms_lead_actor_session_read_allowed(uuid,timestamptz)
  to authenticated;

revoke all on function private.cms_lead_capture_hash(uuid,uuid,jsonb,jsonb),
  private.cms_forms_actor_environment(uuid),
  private.cms_form_scope_allowed(uuid,uuid,text),
  private.cms_form_public_allowed(uuid,text),
  private.cms_lead_assignee_allowed(uuid,uuid,text),
  private.cms_lead_scope_allowed(uuid,uuid,text),
  private.cms_lead_external_delivery_allowed(uuid),
  private.cms_lead_system_scope(uuid),
  private.cms_form_capture_origin_allowed(uuid,uuid,jsonb,text),
  private.cms_form_provenance_guard(),
  private.cms_form_version_scope_guard(),
  private.cms_lead_provenance_guard(),
  private.cms_lead_child_scope_guard(),
  private.cms_lead_export_provenance_guard(),
  private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()
from public,anon,authenticated,service_role;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.cms_forms_list_scoped(uuid,text,text,text,timestamp with time zone,integer)',
    'public.cms_leads_list_scoped(uuid,text,text,integer,integer,text,text,timestamp with time zone)',
    'public.cms_public_form_scoped(text,text,uuid,uuid)',
    'public.cms_save_form_version_scoped(uuid,text,uuid,bigint,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamp with time zone,uuid)',
    'public.cms_capture_lead_scoped(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid)',
    'public.cms_manage_lead_scoped(uuid,text,uuid,text,uuid,text,text,text,timestamp with time zone,uuid)',
    'public.cms_export_leads_scoped(uuid,text,text,text,text,text,timestamp with time zone,uuid)',
    'public.cms_claim_lead_outbox_scoped(integer)'
    ,'public.cms_apply_lead_retention_scoped(integer,uuid,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'CMS_FORMS_LEADS_SCOPE_RPC_MISSING:%',v_signature using errcode='55000';
    end if;
  end loop;
  foreach v_signature in array array[
    'public.cms_save_form_version_unscoped_0072(uuid,uuid,text,text,text,jsonb,text,text,text,integer,integer,text,text,text,timestamp with time zone,uuid)',
    'public.cms_capture_lead_unscoped_0072(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid)',
    'public.cms_export_leads_unscoped_0072(uuid,text,text,text,text,timestamp with time zone,uuid)',
    'public.cms_claim_lead_outbox_unscoped_0072(integer)'
    ,'public.cms_apply_lead_retention_unscoped_0072(integer,uuid)'
    ,'public.cms_enqueue_lead_sla_breaches_unscoped_0072(integer,uuid)'
  ] loop
    if to_regprocedure(v_signature) is null
       or has_function_privilege('service_role',v_signature,'execute') then
      raise exception 'CMS_FORMS_LEADS_UNSCOPED_RPC_EXPOSED:%',v_signature using errcode='55000';
    end if;
  end loop;
end;
$$;
