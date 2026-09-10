begin;

-- O canario de migrations reprovava no teardown com G12_STAGING_SYNTHETIC_LEASE_COMPLETION_FAILED
-- depois de 116 verificacoes aprovadas. A causa nao estava no canario: dois contratos do proprio
-- banco eram insatisfaziveis juntos.
--
-- 0063 instala o fence canonico de escrita, que recusa marcar blob_disposition = 'removed' antes de
-- canonical_cleanup_not_before. Esse instante e calculado como 30 minutos apos o maior prazo entre a
-- expiracao do token de upload assinado, a claim de finalizacao e a neutralizacao, o que na pratica
-- coloca a transicao a cerca de duas horas e meia do run. O fence esta correto: enquanto o token de
-- upload puder escrever, declarar o blob removido abriria uma janela de reuso.
--
-- 0061 exige, para concluir a lease do ator sintetico, que o documento esteja com
-- blob_disposition = 'removed'. Nenhum run consegue satisfazer as duas regras, e a transicao final e
-- justamente responsabilidade do reconciliador de blobs do cms-outbox-worker, que so pode agir
-- depois que o fence expira.
--
-- A correcao aceita o estado intermediario apenas quando ele e provadamente o estado que o fence
-- impoe: acesso revogado, prazo canonico registrado e ainda no futuro. Se o prazo ja passou e a
-- escritura nao avancou, a lease continua reprovando, porque ai existe residuo real. Nenhuma outra
-- condicao de residuo e afrouxada.

create or replace function public.cms_complete_qa_actor_lease(
  p_actor_id uuid,
  p_run_tag text,
  p_candidate_sha text,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $$
declare
  v_lease private.cms_qa_actor_leases%rowtype;
  v_now timestamptz := clock_timestamp();
  v_replayed boolean;
begin
  select * into v_lease
  from private.cms_qa_actor_leases lease
  where lease.actor_id = p_actor_id
    and lease.run_tag = p_run_tag
    and lease.candidate_sha = p_candidate_sha
    and lease.environment = p_environment
  for update;

  if not found
     or not private.cms_qa_actor_marker_is_exact(
       p_actor_id,
       p_run_tag,
       p_candidate_sha,
       p_environment
     ) then
    raise exception 'CMS_QA_ACTOR_LEASE_NOT_FOUND' using errcode = '42501';
  end if;

  v_replayed := v_lease.status = 'cleaned';
  if v_replayed then
    return jsonb_build_object('schemaVersion', 1, 'status', 'cleaned', 'replayed', true);
  end if;

  if exists (
       select 1 from public.cms_content_items item
       where item.created_by = p_actor_id and item.workflow_status <> 'archived'
     )
     or exists (
       select 1 from public.cms_publications publication
       join public.cms_content_items item on item.id = publication.item_id
       where item.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_published_projection projection
       join public.cms_content_items item on item.id = projection.item_id
       where item.created_by = p_actor_id
     )
     or exists (
       select 1 from public.cms_route_rules route
       join public.cms_content_items item on item.id = route.item_id
       where item.created_by = p_actor_id
         and route.active
         and not private.cms_qa_terminal_archived_tombstone_is_exact(
           route.id,
           p_actor_id,
           p_run_tag,
           p_candidate_sha,
           p_environment
         )
     )
     or exists (
       select 1 from public.cms_feature_flag_overrides override
       where override.scope_type = 'user' and override.scope_key = p_actor_id::text
     )
     or exists (select 1 from public.cms_user_roles role where role.user_id = p_actor_id)
     or exists (
       select 1 from public.cms_scoped_role_assignments role
       where role.user_id = p_actor_id and role.revoked_at is null
     )
     or exists (
       select 1 from public.rdo_user_access access
       where access.user_id = p_actor_id and access.active
     )
     or exists (
       select 1 from public.cms_form_definitions form
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and form.status <> 'retired'
     )
     or exists (
       select 1 from public.cms_leads lead
       join public.cms_form_definitions form on form.id = lead.form_id
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and lead.anonymized_at is null
     )
     or exists (
       select 1 from public.cms_lead_outbox outbox
       join public.cms_leads lead on lead.id = outbox.lead_id
       join public.cms_form_definitions form on form.id = lead.form_id
       where form.created_by = p_actor_id
         and form.form_key like ('qa-ops-' || lower(p_run_tag) || '-%')
         and form.title = p_run_tag || ' Formulário operacional'
         and outbox.status in ('pending', 'processing', 'failed', 'dead_letter')
     )
     or exists (
       select 1 from public.cms_ai_sessions session
       where session.actor_id = p_actor_id and session.status = 'active'
     )
     or exists (
       select 1 from public.cms_ai_synthetic_targets target
       where target.created_by = p_actor_id and target.lifecycle <> 'retired'
     )
     or exists (
       select 1 from public.cms_ai_execution_plans plan
       where plan.created_by = p_actor_id and plan.status in ('ready', 'approved', 'executing')
     )
     or exists (
       select 1 from public.cms_ai_execution_approvals approval
       join public.cms_ai_execution_plans plan on plan.id = approval.plan_id
       where plan.created_by = p_actor_id and approval.status = 'active'
     )
     or exists (
       select 1 from public.cms_document_assets document
       where document.created_by = p_actor_id
         and document.source_kind = 'synthetic_test'
         and document.source_reference = p_run_tag
         and (
           document.processing_status <> 'neutralized'
           or document.upload_disposition not in ('guarded', 'removed')
           or (
             document.blob_disposition <> 'removed'
             -- O fence canonico de 0063 proibe marcar 'removed' antes de
             -- canonical_cleanup_not_before, e esse instante fica 30 minutos depois da
             -- expiracao do token de upload assinado, ou seja, horas depois do run. Exigir
             -- 'removed' aqui pedia um estado que a propria base impede, e quem executa essa
             -- transicao mais tarde e o reconciliador de blobs do cms-outbox-worker. O acesso ja
             -- foi revogado e o objeto ja foi removido do Storage; o que falta e apenas a
             -- escritura canonica, e ela so e aceita enquanto o fence estiver de fato ativo.
             and not (
               document.blob_disposition = 'access_revoked'
               and document.canonical_cleanup_not_before is not null
               and document.canonical_cleanup_not_before > v_now
             )
           )
         )
     )
     or exists (
       select 1 from public.cms_profiles profile
       where profile.user_id = p_actor_id and profile.status <> 'suspended'
     )
     or exists (select 1 from auth.sessions session where session.user_id = p_actor_id)
     or not exists (
       select 1 from auth.users actor
       where actor.id = p_actor_id and actor.banned_until > v_now
     ) then
    raise exception 'CMS_QA_ACTOR_CLEANUP_INCOMPLETE' using errcode = '55000';
  end if;

  update private.cms_qa_actor_leases
  set status = 'cleaned',
      cleaned_at = v_now,
      last_attempt_at = v_now,
      last_error_code = null
  where actor_id = p_actor_id;

  insert into public.cms_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    event_data,
    correlation_id
  ) values (
    p_actor_id,
    'cms:qa.fixture_lease_cleaned',
    'qa_fixture',
    p_run_tag,
    jsonb_build_object(
      'schemaVersion', 1,
      'syntheticOnly', true,
      'environment', p_environment,
      'candidateSha', p_candidate_sha,
      'watchdogPreviouslySwept', v_lease.swept_at is not null
    ),
    gen_random_uuid()
  );

  return jsonb_build_object('schemaVersion', 1, 'status', 'cleaned', 'replayed', false);
end;
$$;

revoke all on function public.cms_complete_qa_actor_lease(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.cms_complete_qa_actor_lease(uuid,text,text,text) to service_role;

do $qa_lease_document_fence_probe$
declare
  v_definition text;
begin
  v_definition := regexp_replace(
    pg_get_functiondef(
      'public.cms_complete_qa_actor_lease(uuid,text,text,text)'::regprocedure
    ),
    '[[:space:]]+', ' ', 'g'
  );
  if v_definition !~ 'canonical_cleanup_not_before > v_now' then
    raise exception 'CMS_QA_LEASE_DOCUMENT_FENCE_NOT_APPLIED' using errcode = '55000';
  end if;
  if v_definition !~ 'upload_disposition not in' then
    raise exception 'CMS_QA_LEASE_DOCUMENT_CONTRACT_WEAKENED' using errcode = '55000';
  end if;
  if has_function_privilege('authenticated',
       'public.cms_complete_qa_actor_lease(uuid,text,text,text)', 'EXECUTE') then
    raise exception 'CMS_QA_LEASE_PRIVILEGE_WIDENED' using errcode = '55000';
  end if;
end;
$qa_lease_document_fence_probe$;

commit;
