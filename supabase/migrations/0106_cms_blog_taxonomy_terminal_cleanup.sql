-- Remove somente taxonomias sinteticas pertencentes ao grupo exato de leases
-- QA depois que todo o grupo terminou. Slugs corporativos ou ainda referenciados
-- permanecem intocados; qualquer ambiguidade aborta a transicao terminal.

begin;

create or replace function private.cms_cleanup_qa_blog_taxonomy_0106(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text,
  p_terminal_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_author_ids uuid[] := '{}'::uuid[];
  v_category_ids uuid[] := '{}'::uuid[];
  v_tag_ids uuid[] := '{}'::uuid[];
  v_reference_ids uuid[] := '{}'::uuid[];
  v_removed_authors integer := 0;
  v_removed_categories integer := 0;
  v_removed_tags integer := 0;
  v_claims_sha text;
begin
  if p_actor_id is null
     or p_run_tag is null
     or p_candidate_sha is null
     or p_environment is null
     or p_terminal_status is null
     or p_run_tag !~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$'
     or p_candidate_sha !~ '^[0-9a-f]{40}$'
     or pg_catalog.right(p_run_tag, 9) <> ('-' || pg_catalog.left(p_candidate_sha, 8))
     or p_environment not in ('staging', 'production')
     or p_terminal_status not in ('cleaned', 'expired') then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_INPUT_INVALID' using errcode = '22023';
  end if;

  -- Serializa o grupo sem tentar bloquear a row do peer: cada UPDATE ja detem
  -- a propria row. Assim dois peers nunca observam ambos como active nem
  -- invertem a ordem advisory->lease usada pelo writer 0069.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cms-qa-blog-taxonomy-group:' || p_run_tag || ':' || p_candidate_sha || ':' || p_environment,
      0
    )
  );

  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
  for update;

  if not found
     or v_lease.run_tag is distinct from p_run_tag
     or v_lease.candidate_sha is distinct from p_candidate_sha
     or v_lease.environment is distinct from p_environment
     or v_lease.status not in ('active', p_terminal_status)
     or not private.cms_qa_actor_marker_is_exact(
       v_lease.actor_id,
       v_lease.run_tag,
       v_lease.candidate_sha,
       v_lease.environment
     ) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_LEASE_MISMATCH' using errcode = '42501';
  end if;

  -- A taxonomia pode ser compartilhada apenas por atores ativos do mesmo run.
  -- O ultimo ator terminal limpa o grupo inteiro; os anteriores apenas adiam.
  if exists (
    select 1
    from private.cms_qa_actor_leases peer
    where peer.actor_id <> p_actor_id
      and peer.run_tag = p_run_tag
      and peer.candidate_sha = p_candidate_sha
      and peer.environment = p_environment
      and peer.status = 'active'
  ) then
    return pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'status', 'deferred',
      'reason', 'same_run_actor_active',
      'terminalStatus', p_terminal_status
    );
  end if;

  -- Qualquer linha apenas parcialmente ligada ao grupo, fora da janela ou sem
  -- marker exato e ambigua. Nao a ignora nem tenta adivinhar propriedade.
  if exists (
    select 1
    from (
      select author.created_by, author.updated_by, author.created_at, author.updated_at
      from public.cms_blog_authors author
      union all
      select category.created_by, category.updated_by, category.created_at, category.updated_at
      from public.cms_blog_categories category
      union all
      select tag.created_by, tag.updated_by, tag.created_at, tag.updated_at
      from public.cms_blog_tags tag
    ) taxonomy
    left join private.cms_qa_actor_leases creator on creator.actor_id = taxonomy.created_by
    left join private.cms_qa_actor_leases updater on updater.actor_id = taxonomy.updated_by
    where (
      (
        creator.run_tag = p_run_tag
        and creator.candidate_sha = p_candidate_sha
        and creator.environment = p_environment
      )
      or (
        updater.run_tag = p_run_tag
        and updater.candidate_sha = p_candidate_sha
        and updater.environment = p_environment
      )
    )
      and (
        creator.run_tag = p_run_tag
        and creator.candidate_sha = p_candidate_sha
        and creator.environment = p_environment
        and updater.run_tag = p_run_tag
        and updater.candidate_sha = p_candidate_sha
        and updater.environment = p_environment
        and taxonomy.created_at between creator.created_at and creator.expires_at
        and taxonomy.updated_at between updater.created_at and updater.expires_at
        and private.cms_qa_actor_marker_is_exact(
          creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
        )
      ) is not true
  ) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_SCOPE_AMBIGUOUS' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.array_agg(author.id order by author.id), '{}'::uuid[])
  into v_author_ids
  from public.cms_blog_authors author
  join private.cms_qa_actor_leases creator on creator.actor_id = author.created_by
  join private.cms_qa_actor_leases updater on updater.actor_id = author.updated_by
  where creator.run_tag = p_run_tag
    and creator.candidate_sha = p_candidate_sha
    and creator.environment = p_environment
    and updater.run_tag = p_run_tag
    and updater.candidate_sha = p_candidate_sha
    and updater.environment = p_environment
    and author.created_at between creator.created_at and creator.expires_at
    and author.updated_at between updater.created_at and updater.expires_at
    and private.cms_qa_actor_marker_is_exact(
      creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
    )
    and private.cms_qa_actor_marker_is_exact(
      updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
    );

  select coalesce(pg_catalog.array_agg(category.id order by category.id), '{}'::uuid[])
  into v_category_ids
  from public.cms_blog_categories category
  join private.cms_qa_actor_leases creator on creator.actor_id = category.created_by
  join private.cms_qa_actor_leases updater on updater.actor_id = category.updated_by
  where creator.run_tag = p_run_tag
    and creator.candidate_sha = p_candidate_sha
    and creator.environment = p_environment
    and updater.run_tag = p_run_tag
    and updater.candidate_sha = p_candidate_sha
    and updater.environment = p_environment
    and category.created_at between creator.created_at and creator.expires_at
    and category.updated_at between updater.created_at and updater.expires_at
    and private.cms_qa_actor_marker_is_exact(
      creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
    )
    and private.cms_qa_actor_marker_is_exact(
      updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
    );

  select coalesce(pg_catalog.array_agg(tag.id order by tag.id), '{}'::uuid[])
  into v_tag_ids
  from public.cms_blog_tags tag
  join private.cms_qa_actor_leases creator on creator.actor_id = tag.created_by
  join private.cms_qa_actor_leases updater on updater.actor_id = tag.updated_by
  where creator.run_tag = p_run_tag
    and creator.candidate_sha = p_candidate_sha
    and creator.environment = p_environment
    and updater.run_tag = p_run_tag
    and updater.candidate_sha = p_candidate_sha
    and updater.environment = p_environment
    and tag.created_at between creator.created_at and creator.expires_at
    and tag.updated_at between updater.created_at and updater.expires_at
    and private.cms_qa_actor_marker_is_exact(
      creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
    )
    and private.cms_qa_actor_marker_is_exact(
      updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
    );

  v_reference_ids := v_author_ids || v_category_ids || v_tag_ids;
  if pg_catalog.cardinality(v_reference_ids) = 0 then
    return pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'status', 'noop',
      'removedAuthors', 0,
      'removedCategories', 0,
      'removedTags', 0,
      'terminalStatus', p_terminal_status
    );
  end if;

  -- O fence de grupo ja foi adquirido antes de qualquer espera. Os row locks
  -- abaixo sao deterministas e nao invertem o advisory->lease do writer 0069.
  perform 1 from public.cms_blog_authors author
  where author.id = any(v_author_ids) order by author.id for update;
  perform 1 from public.cms_blog_categories category
  where category.id = any(v_category_ids) order by category.id for update;
  perform 1 from public.cms_blog_tags tag
  where tag.id = any(v_tag_ids) order by tag.id for update;

  -- Projecao publica nunca pode depender de uma taxonomia removida. Historico
  -- arquivado e integralmente pertencente ao mesmo run pode manter apenas UUIDs.
  begin
    if exists (
       select 1
       from public.cms_published_projection projection
       where (
        nullif(projection.payload #>> '{author,id}', '')::uuid = any(v_author_ids)
        or (
          nullif(projection.payload #>> '{category,id}', '')::uuid = any(v_category_ids)
        )
         or exists (
           select 1
           from pg_catalog.jsonb_array_elements(
             case
               when pg_catalog.jsonb_typeof(projection.payload -> 'tags') = 'array'
                 then projection.payload -> 'tags'
               else '[]'::jsonb
             end
           ) tag(entry)
          where nullif(tag.entry ->> 'id', '')::uuid = any(v_tag_ids)
         )
       )
     )
     or exists (
       select 1
       from (
         select
           draft.item_id,
           draft.payload,
           draft.updated_by as reference_actor_id,
           draft.updated_at as reference_at
         from public.cms_content_drafts draft
         union all
         select
           revision.item_id,
           revision.payload,
           revision.created_by as reference_actor_id,
           revision.created_at as reference_at
         from public.cms_content_revisions revision
         union all
         select
           snapshot.item_id,
           snapshot.payload,
           snapshot.displaced_by as reference_actor_id,
           snapshot.captured_at as reference_at
         from public.cms_content_draft_snapshots snapshot
       ) reference
       join public.cms_content_items item on item.id = reference.item_id
       where (
         nullif(reference.payload #>> '{author,id}', '')::uuid = any(v_author_ids)
         or (
           nullif(reference.payload #>> '{category,id}', '')::uuid = any(v_category_ids)
         )
          or exists (
            select 1
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(reference.payload -> 'tags') = 'array'
                  then reference.payload -> 'tags'
                else '[]'::jsonb
              end
            ) tag(entry)
           where nullif(tag.entry ->> 'id', '')::uuid = any(v_tag_ids)
          )
        )
         and (
           item.workflow_status <> 'archived'
           or not exists (
             select 1
              from private.cms_qa_actor_leases creator
              join private.cms_qa_actor_leases updater on updater.actor_id = item.updated_by
              join private.cms_qa_actor_leases reference_actor
                on reference_actor.actor_id = reference.reference_actor_id
              where creator.actor_id = item.created_by
               and creator.run_tag = p_run_tag
               and creator.candidate_sha = p_candidate_sha
               and creator.environment = p_environment
                and updater.run_tag = p_run_tag
                and updater.candidate_sha = p_candidate_sha
                and updater.environment = p_environment
                and reference_actor.run_tag = p_run_tag
                and reference_actor.candidate_sha = p_candidate_sha
                and reference_actor.environment = p_environment
                and item.created_at between creator.created_at and creator.expires_at
                -- O cleanup zz anterior arquiva e toca updated_at no instante
                -- terminal, que pode ser posterior ao TTL. O limite inferior
                -- ainda prova que o updater pertence a esta execucao.
                and item.updated_at >= updater.created_at
                and reference.reference_at between reference_actor.created_at and reference_actor.expires_at
                and private.cms_qa_actor_marker_is_exact(
                 creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
               )
                and private.cms_qa_actor_marker_is_exact(
                  updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
                )
                and private.cms_qa_actor_marker_is_exact(
                  reference_actor.actor_id,
                  reference_actor.run_tag,
                  reference_actor.candidate_sha,
                  reference_actor.environment
                )
            )
         )
     ) then
      raise exception 'CMS_QA_BLOG_TAXONOMY_REFERENCE_ACTIVE' using errcode = '40001';
    end if;
  exception
    when invalid_text_representation then
      raise exception 'CMS_QA_BLOG_TAXONOMY_REFERENCE_AMBIGUOUS' using errcode = '40001';
  end;

  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(pg_catalog.string_agg(reference.claim, ':' order by reference.claim), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) into v_claims_sha
  from (
    select 'author:' || id::text as claim from pg_catalog.unnest(v_author_ids) id
    union all
    select 'category:' || id::text from pg_catalog.unnest(v_category_ids) id
    union all
    select 'tag:' || id::text from pg_catalog.unnest(v_tag_ids) id
  ) reference;

  delete from public.cms_blog_tags tag
  where tag.id = any(v_tag_ids)
    and exists (
      select 1
      from private.cms_qa_actor_leases creator
      join private.cms_qa_actor_leases updater on updater.actor_id = tag.updated_by
      where creator.actor_id = tag.created_by
        and creator.run_tag = p_run_tag
        and creator.candidate_sha = p_candidate_sha
        and creator.environment = p_environment
        and updater.run_tag = p_run_tag
        and updater.candidate_sha = p_candidate_sha
        and updater.environment = p_environment
        and tag.created_at between creator.created_at and creator.expires_at
        and tag.updated_at between updater.created_at and updater.expires_at
        and private.cms_qa_actor_marker_is_exact(
          creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
        )
    );
  get diagnostics v_removed_tags = row_count;

  delete from public.cms_blog_categories category
  where category.id = any(v_category_ids)
    and exists (
      select 1
      from private.cms_qa_actor_leases creator
      join private.cms_qa_actor_leases updater on updater.actor_id = category.updated_by
      where creator.actor_id = category.created_by
        and creator.run_tag = p_run_tag
        and creator.candidate_sha = p_candidate_sha
        and creator.environment = p_environment
        and updater.run_tag = p_run_tag
        and updater.candidate_sha = p_candidate_sha
        and updater.environment = p_environment
        and category.created_at between creator.created_at and creator.expires_at
        and category.updated_at between updater.created_at and updater.expires_at
        and private.cms_qa_actor_marker_is_exact(
          creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
        )
    );
  get diagnostics v_removed_categories = row_count;

  delete from public.cms_blog_authors author
  where author.id = any(v_author_ids)
    and exists (
      select 1
      from private.cms_qa_actor_leases creator
      join private.cms_qa_actor_leases updater on updater.actor_id = author.updated_by
      where creator.actor_id = author.created_by
        and creator.run_tag = p_run_tag
        and creator.candidate_sha = p_candidate_sha
        and creator.environment = p_environment
        and updater.run_tag = p_run_tag
        and updater.candidate_sha = p_candidate_sha
        and updater.environment = p_environment
        and author.created_at between creator.created_at and creator.expires_at
        and author.updated_at between updater.created_at and updater.expires_at
        and private.cms_qa_actor_marker_is_exact(
          creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
        )
    );
  get diagnostics v_removed_authors = row_count;

  if v_removed_authors <> pg_catalog.cardinality(v_author_ids)
     or v_removed_categories <> pg_catalog.cardinality(v_category_ids)
     or v_removed_tags <> pg_catalog.cardinality(v_tag_ids)
     or exists (select 1 from public.cms_blog_authors where id = any(v_author_ids))
     or exists (select 1 from public.cms_blog_categories where id = any(v_category_ids))
     or exists (select 1 from public.cms_blog_tags where id = any(v_tag_ids)) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  insert into public.cms_audit_log (
    actor_id, action, target_type, target_id, event_data, correlation_id
  ) values (
    p_actor_id,
    'cms:qa.blog_taxonomy.compensated',
    'qa_fixture',
    p_run_tag,
    pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'authorsRemoved', v_removed_authors,
      'categoriesRemoved', v_removed_categories,
      'tagsRemoved', v_removed_tags,
      'claimsSha256', v_claims_sha,
      'environment', p_environment,
      'candidateSha', p_candidate_sha,
      'terminalStatus', p_terminal_status
    ),
    pg_catalog.gen_random_uuid()
  );

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'status', 'compensated',
    'removedAuthors', v_removed_authors,
    'removedCategories', v_removed_categories,
    'removedTags', v_removed_tags,
    'claimsSha256', v_claims_sha,
    'terminalStatus', p_terminal_status
  );
end;
$$;

revoke all on function private.cms_cleanup_qa_blog_taxonomy_0106(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function private.cms_cleanup_terminal_qa_blog_taxonomy_0106()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active'
     and new.status in ('cleaned', 'expired')
     and new.status <> old.status then
    perform private.cms_cleanup_qa_blog_taxonomy_0106(
      old.actor_id,
      old.run_tag,
      old.candidate_sha,
      old.environment,
      new.status
    );
  end if;
  return new;
end;
$$;

revoke all on function private.cms_cleanup_terminal_qa_blog_taxonomy_0106()
  from public, anon, authenticated, service_role;

-- Depois de zz_cms_cleanup_qa_content_before_terminal e antes das faixas zzz/zzzz.
drop trigger if exists zzy_cms_cleanup_qa_blog_taxonomy_0106
  on private.cms_qa_actor_leases;
create trigger zzy_cms_cleanup_qa_blog_taxonomy_0106
before update of status on private.cms_qa_actor_leases
for each row execute function private.cms_cleanup_terminal_qa_blog_taxonomy_0106();

-- Repara somente grupos que ja sao integralmente terminais. Leases ativas nunca
-- sao antecipadas, mesmo quando o TTL venceu.
do $qa_blog_taxonomy_terminal_backfill$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
begin
  for v_lease in
    select distinct on (lease.run_tag, lease.candidate_sha, lease.environment) lease.*
    from private.cms_qa_actor_leases lease
    where lease.status in ('cleaned', 'expired')
      and not exists (
        select 1
        from private.cms_qa_actor_leases active_peer
        where active_peer.run_tag = lease.run_tag
          and active_peer.candidate_sha = lease.candidate_sha
          and active_peer.environment = lease.environment
          and active_peer.status = 'active'
      )
      and (
        exists (select 1 from public.cms_blog_authors author where author.created_by = lease.actor_id or author.updated_by = lease.actor_id)
        or exists (select 1 from public.cms_blog_categories category where category.created_by = lease.actor_id or category.updated_by = lease.actor_id)
        or exists (select 1 from public.cms_blog_tags tag where tag.created_by = lease.actor_id or tag.updated_by = lease.actor_id)
      )
    order by lease.run_tag, lease.candidate_sha, lease.environment, lease.actor_id
  loop
    perform private.cms_cleanup_qa_blog_taxonomy_0106(
      v_lease.actor_id,
      v_lease.run_tag,
      v_lease.candidate_sha,
      v_lease.environment,
      v_lease.status
    );
  end loop;
end;
$qa_blog_taxonomy_terminal_backfill$;

do $qa_blog_taxonomy_terminal_probe$
declare
  v_cleanup regprocedure := to_regprocedure(
    'private.cms_cleanup_qa_blog_taxonomy_0106(uuid,text,text,text,text)'
  );
  v_trigger_function regprocedure := to_regprocedure(
    'private.cms_cleanup_terminal_qa_blog_taxonomy_0106()'
  );
begin
  if v_cleanup is null or v_trigger_function is null then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_FUNCTION_MISSING' using errcode = '55000';
  end if;
  if has_function_privilege('anon', v_cleanup, 'EXECUTE')
     or has_function_privilege('authenticated', v_cleanup, 'EXECUTE')
     or has_function_privilege('service_role', v_cleanup, 'EXECUTE')
     or has_function_privilege('anon', v_trigger_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_trigger_function, 'EXECUTE')
     or has_function_privilege('service_role', v_trigger_function, 'EXECUTE') then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_ACL_INVALID' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'private.cms_qa_actor_leases'::regclass
      and trigger.tgname = 'zzy_cms_cleanup_qa_blog_taxonomy_0106'
      and trigger.tgfoid = v_trigger_function::oid
      and trigger.tgenabled = 'O'
      and not trigger.tgisinternal
  ) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_CLEANUP_TRIGGER_INVALID' using errcode = '55000';
  end if;
  if exists (
    select 1
    from (
      select author.created_by, author.updated_by, author.created_at, author.updated_at
      from public.cms_blog_authors author
      union all
      select category.created_by, category.updated_by, category.created_at, category.updated_at
      from public.cms_blog_categories category
      union all
      select tag.created_by, tag.updated_by, tag.created_at, tag.updated_at
      from public.cms_blog_tags tag
    ) taxonomy
    join private.cms_qa_actor_leases creator on creator.actor_id = taxonomy.created_by
    join private.cms_qa_actor_leases updater on updater.actor_id = taxonomy.updated_by
    where creator.status in ('cleaned', 'expired')
      and updater.status in ('cleaned', 'expired')
      and creator.run_tag = updater.run_tag
      and creator.candidate_sha = updater.candidate_sha
      and creator.environment = updater.environment
      and taxonomy.created_at between creator.created_at and creator.expires_at
      and taxonomy.updated_at between updater.created_at and updater.expires_at
      and private.cms_qa_actor_marker_is_exact(
        creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
      )
      and private.cms_qa_actor_marker_is_exact(
        updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
      )
      and not exists (
        select 1
        from private.cms_qa_actor_leases active_peer
        where active_peer.run_tag = creator.run_tag
          and active_peer.candidate_sha = creator.candidate_sha
          and active_peer.environment = creator.environment
          and active_peer.status = 'active'
      )
  ) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_TERMINAL_RESIDUE_PRESENT' using errcode = '55000';
  end if;
  if exists (
    select 1
    from (
      select author.created_by, author.updated_by, author.created_at, author.updated_at
      from public.cms_blog_authors author
      union all
      select category.created_by, category.updated_by, category.created_at, category.updated_at
      from public.cms_blog_categories category
      union all
      select tag.created_by, tag.updated_by, tag.created_at, tag.updated_at
      from public.cms_blog_tags tag
    ) taxonomy
    left join private.cms_qa_actor_leases creator on creator.actor_id = taxonomy.created_by
    left join private.cms_qa_actor_leases updater on updater.actor_id = taxonomy.updated_by
    where (
      (
        creator.status in ('cleaned', 'expired')
        and not exists (
          select 1
          from private.cms_qa_actor_leases active_peer
          where active_peer.run_tag = creator.run_tag
            and active_peer.candidate_sha = creator.candidate_sha
            and active_peer.environment = creator.environment
            and active_peer.status = 'active'
        )
      )
      or (
        updater.status in ('cleaned', 'expired')
        and not exists (
          select 1
          from private.cms_qa_actor_leases active_peer
          where active_peer.run_tag = updater.run_tag
            and active_peer.candidate_sha = updater.candidate_sha
            and active_peer.environment = updater.environment
            and active_peer.status = 'active'
        )
      )
    )
      and (
        creator.status in ('cleaned', 'expired')
        and updater.status in ('cleaned', 'expired')
        and creator.run_tag = updater.run_tag
        and creator.candidate_sha = updater.candidate_sha
        and creator.environment = updater.environment
        and taxonomy.created_at between creator.created_at and creator.expires_at
        and taxonomy.updated_at between updater.created_at and updater.expires_at
        and private.cms_qa_actor_marker_is_exact(
          creator.actor_id, creator.run_tag, creator.candidate_sha, creator.environment
        )
        and private.cms_qa_actor_marker_is_exact(
          updater.actor_id, updater.run_tag, updater.candidate_sha, updater.environment
        )
      ) is not true
  ) then
    raise exception 'CMS_QA_BLOG_TAXONOMY_TERMINAL_SCOPE_AMBIGUOUS' using errcode = '55000';
  end if;
end;
$qa_blog_taxonomy_terminal_probe$;

commit;
