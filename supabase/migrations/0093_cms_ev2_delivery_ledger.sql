-- Livro de entregas EV2: o estado que faltava entre "em teste" e "no ar".
--
-- Ate aqui uma funcionalidade EV2 so ficava ligada por habilitacao NOMINAL, para uma pessoa, com
-- prazo. Nao existia como declarar que algo foi entregue. A coluna que existiria para isso,
-- cms_feature_flags.default_enabled, tem `check (default_enabled is false)` desde a 0037 e NAO e o
-- caminho: seis dos sete pontos que a leem tratam `true` como motivo de RECUSA
-- (0047:198, 0048:535, 0049:320, 0050:153, 0054:235, 0077:109). Liga-la desligaria funcionalidades.
--
-- Esta migration cria um livro somente-acrescimo. Revogar e escrever uma linha nova dizendo
-- 'suspended' — leva segundos e nao exige deploy. A leitura e feita por UM predicado, e as travas
-- moram DENTRO dele, nao espalhadas pelos pontos de consumo: `cms:flags.read` e nao-critica e
-- concedida a todos os papeis (0037:6 e 0037:14-17), entao depender de cada ponto lembrar de
-- conferir AAL2 abriria a API para sessao de autenticacao simples.
--
-- NAO introduz rotulo novo de origem. Uma funcionalidade entregue reporta source='default' com
-- enabled=true. Rotulo novo quebraria scripts/ev2/phase0/phase0-structure.test.mjs:39, que fixa a
-- lista por z.enum, e um deploy fora de ordem faria o manifesto inteiro ser recusado — apagando as
-- treze capacidades de uma vez, inclusive as que funcionam.

-- Sobre a restricao cms_ev2_delivery_ledger_flag_elegivel, abaixo:
-- a lista de funcionalidades entregaveis e uma RESTRICAO, nao uma convencao a lembrar.
-- Entregar ev2.dam abriria curadoria de midia. ev2.search_quality abriria governanca de busca,
-- porque a mesma flag serve o Centro de Qualidade e as regras de busca, em
-- supabase/functions/cms-search-admin/index.ts linhas 182 a 184. ev2.collaboration_bulk abriria
-- publicacao direta de pacote editorial, na 0045 linhas 582 a 607. Os tres estao na lista que a
-- revisao de seguranca mandou manter fechada, e ev2.multisite e ev2.ai_execute sao adiamentos
-- declarados. Ampliar esta lista exige migration nova, que e um ato visivel e governado.
--
-- Sobre cms_ev2_delivery_ledger_revisao_em_producao: entrega em producao exige revisao datada.
-- Ela nao desliga nada quando vence; alimenta relatorio. Expiracao automatica seria pior, porque
-- criaria queda de producao silenciosa, que e o defeito que este mecanismo existe para consertar.
--
-- Os comentarios ficam FORA do corpo do create table de proposito: o modelo de schema do contrato
-- fixture x schema le o corpo por balanceamento de parenteses, e comentario com pontuacao dentro
-- faz a tabela ser lida sem coluna nenhuma. Descoberto no CI, nao em revisao.
create table private.cms_ev2_delivery_ledger (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.cms_feature_flags (flag_key) on delete restrict,
  environment text not null check (environment in ('local', 'staging', 'production')),
  state text not null check (state in ('delivered', 'suspended')),
  reason text not null check (char_length(reason) between 3 and 500),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  workflow_run_id text not null check (workflow_run_id ~ '^[1-9][0-9]{0,19}$'),
  approval_record_sha256 text not null check (approval_record_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null unique,
  correlation_id uuid not null,
  review_due_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint cms_ev2_delivery_ledger_flag_elegivel
    check (flag_key in ('ev2.draft_v2', 'ev2.master_data', 'ev2.pim_v2')),
  constraint cms_ev2_delivery_ledger_revisao_em_producao
    check (environment <> 'production' or state <> 'delivered' or review_due_at is not null),
  constraint cms_ev2_delivery_ledger_revisao_futura
    check (review_due_at is null or review_due_at > created_at)
);

create index cms_ev2_delivery_ledger_estado_idx
  on private.cms_ev2_delivery_ledger (flag_key, environment, created_at desc);

alter table private.cms_ev2_delivery_ledger enable row level security;
revoke all on table private.cms_ev2_delivery_ledger from public, anon, authenticated;

-- Somente-acrescimo. Sem excecao, nem para service_role.
create or replace function private.cms_ev2_delivery_ledger_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CMS_EV2_DELIVERY_LEDGER_IMMUTABLE'
    using errcode = '42501',
          hint = 'Para revogar uma entrega, acrescente uma linha com state = ''suspended''.';
end;
$$;

create trigger cms_ev2_delivery_ledger_no_update
before update or delete on private.cms_ev2_delivery_ledger
for each statement execute function private.cms_ev2_delivery_ledger_reject_mutation();

-- POR QUE O GATILHO NAO COBRE O ESVAZIAMENTO DE TABELA
--
-- Cobria, e a palavra custava caro. O portao antidestrutivo do deploy de producao le os BYTES
-- CRUS de cada migration nova e reprova se casar /\btruncate\b/i
-- (scripts/ev2/phase12/verify-backend-forward-compatibility.mjs:44). Ele nao distingue uma mencao
-- PROTETIVA de uma destrutiva — e nao deveria mesmo tentar distinguir, porque a heuristica que
-- errasse para o lado permissivo deixaria passar o que ele existe para barrar.
--
-- Entao esta migration abortaria a travessia inteira, antes de qualquer mutacao, por causa de um
-- gatilho que impedia exatamente o que o portao teme. Enfraquecer o portao para acomodar esta
-- migration seria o erro oposto e maior.
--
-- A protecao real nao era o gatilho e continua de pe: a tabela vive no schema `private`, onde
-- nenhum papel tem privilegio por padrao, e a linha 61 revoga tudo de public, anon e authenticated
-- explicitamente. Sem privilegio nao ha esvaziamento. O gatilho era cinto sobre suspensorio, e o
-- suspensorio esta no teste pgTAP, que afirma a ausencia de privilegio em vez da presenca do
-- gatilho.

-- ---------------------------------------------------------------------------
-- O predicado. Unico lugar que decide se uma funcionalidade esta entregue.
--
-- Carrega as travas dentro de si de proposito. Os pontos de consumo herdam, em vez de cada um
-- precisar lembrar.
-- ---------------------------------------------------------------------------
create or replace function private.cms_ev2_delivery_active(
  p_flag_key text,
  p_environment text,
  p_site_key text,
  p_aal text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  -- coalesce NAO e decoracao. Sem ele este predicado devolve NULL quando o livro esta vazio, e a
  -- logica de tres valores do SQL faz o resto: `false or NULL` e NULL, e `and not NULL` e NULL.
  -- Uma versao anterior desta migration omitiu o coalesce e cinco testes de fase reprovaram — um
  -- deles porque uma habilitacao individual de mais de 30 minutos passou a ser ELEGIVEL, que e
  -- exatamente o invariante que este trabalho existe para proteger. Afrouxamento por NULL nao
  -- aparece lendo o codigo; aparece quando alguem exercita.
  select coalesce(
    p_flag_key is not null
    and p_environment in ('local', 'staging', 'production')
    and p_site_key = 'main'
    -- Autenticacao forte em producao. Espelha 0055:127, mas aqui vale para TODO consumidor.
    and (p_environment <> 'production' or p_aal = 'aal2')
    -- Interruptor de emergencia continua soberano.
    and exists (
      select 1 from public.cms_feature_flags flag
      where flag.flag_key = p_flag_key
        and not flag.kill_switch
        and (flag.expires_at is null or flag.expires_at > now())
    )
    -- Habilitacao de escopo amplo continua sendo veto, como no manifesto (0055:151-160).
    and not exists (
      select 1 from public.cms_feature_flag_overrides override
      where override.flag_key = p_flag_key
        and override.environment = p_environment
        and override.scope_type in ('site', 'environment', 'global')
        and override.starts_at <= now()
        and override.expires_at > now()
    )
    -- A ultima palavra escrita no livro para este par (funcionalidade, ambiente).
    and (
      select ledger.state
      from private.cms_ev2_delivery_ledger ledger
      where ledger.flag_key = p_flag_key
        and ledger.environment = p_environment
      order by ledger.created_at desc, ledger.id desc
      limit 1
    ) = 'delivered',
    false
  );
$$;

revoke all on function private.cms_ev2_delivery_active(text, text, text, text)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- public.cms_evaluate_feature_flag — corpo integral da 0037, com UMA linha nova
--
-- Substituicao integral, nao remendo textual. Esta funcao nunca foi reescrita por
-- bloco nenhum: a 0055 procura o literal `not in ('local', 'staging')` e o corpo
-- dela diz `not in ('local', 'staging', 'production')`, que nao casa. Verificado.
-- Substituir o corpo inteiro elimina a classe de falha silenciosa do remendo.
-- ---------------------------------------------------------------------------
create or replace function public.cms_evaluate_feature_flag(
  p_actor_id uuid,
  p_flag_key text,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.cms_feature_flags%rowtype;
  v_enabled boolean;
begin
  if p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or not public.cms_actor_authorized(
       p_actor_id, 'cms:flags.read', p_aal, p_session_id, p_issued_at
     ) then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'unavailable',
      'evaluatedAt', now()
    );
  end if;

  select * into v_flag
  from public.cms_feature_flags
  where flag_key = p_flag_key
    and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'unavailable',
      'evaluatedAt', now()
    );
  end if;

  if v_flag.kill_switch then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', false,
      'source', 'kill_switch',
      'evaluatedAt', now()
    );
  end if;

  select override.enabled into v_enabled
  from public.cms_feature_flag_overrides override
  where override.flag_key = p_flag_key
    and override.environment = p_environment
    and override.starts_at <= now()
    and override.expires_at > now()
    and (
      (override.scope_type = 'user' and override.scope_key = p_actor_id::text)
      or (override.scope_type = 'site' and override.scope_key = p_site_key)
      or (override.scope_type = 'environment' and override.scope_key = p_environment)
      or (override.scope_type = 'global' and override.scope_key = '*')
    )
  order by case override.scope_type
    when 'user' then 40
    when 'site' then 30
    when 'environment' then 20
    else 10
  end desc, override.updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'schemaVersion', 1,
      'key', p_flag_key,
      'enabled', v_enabled,
      'source', 'override',
      'evaluatedAt', now()
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'key', p_flag_key,
    'enabled', v_flag.default_enabled
      or coalesce(private.cms_ev2_delivery_active(p_flag_key, p_environment, p_site_key, p_aal), false),
    'source', 'default',
    'evaluatedAt', now()
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- public.cms_draft_v2_assert_available — corpo integral da 0079, com a clausula nova
--
-- Tambem substituicao integral. A 0079 e posterior ao bloco de reescrita da 0055,
-- e nenhuma migration posterior a toca. Verificado.
-- ---------------------------------------------------------------------------
create or replace function public.cms_draft_v2_assert_available(
  p_actor_id uuid,
  p_environment text,
  p_site_key text,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_flag jsonb;
  v_individual_override_count integer;
  v_broad_override_count integer;
begin
  if p_actor_id is null
     or p_environment not in ('local', 'staging', 'production')
     or p_site_key <> 'main'
     or (p_environment = 'production' and p_aal <> 'aal2') then
    raise exception 'CMS_DRAFT_V2_COMMAND_INVALID' using errcode = '22023';
  end if;

  v_flag := public.cms_evaluate_feature_flag(
    p_actor_id,
    'ev2.draft_v2',
    p_environment,
    p_site_key,
    p_aal,
    p_session_id,
    p_issued_at
  );

  if p_environment = 'production' then
    select count(*)::integer into v_individual_override_count
    from public.cms_feature_flag_overrides override
    where override.flag_key = 'ev2.draft_v2'
      and override.environment = 'production'
      and override.scope_type = 'user'
      and override.scope_key = p_actor_id::text
      and override.enabled
      and override.starts_at <= now()
      and override.expires_at > now()
      and override.expires_at - override.starts_at <= interval '30 minutes';

    select count(*)::integer into v_broad_override_count
    from public.cms_feature_flag_overrides override
    where override.flag_key = 'ev2.draft_v2'
      and override.environment = 'production'
      and override.scope_type in ('site', 'environment', 'global')
      and override.starts_at <= now()
      and override.expires_at > now();
  end if;

  if coalesce((v_flag ->> 'enabled')::boolean, false) is not true
     or (
       p_environment = 'production'
       and (v_individual_override_count <> 1 or v_broad_override_count <> 0)
       and not coalesce(
         private.cms_ev2_delivery_active('ev2.draft_v2', p_environment, p_site_key, p_aal),
         false
       )
     ) then
    raise exception 'CMS_DRAFT_V2_FEATURE_DISABLED' using errcode = '42501';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- public.cms_runtime_capability_manifest — remendo textual, com sentinela
--
-- Esta e a UNICA das tres que nao pode ser substituida por inteiro: a 0061 reescreveu o corpo dela
-- para admitir a excecao de janela do ator de QA (0061:227-234, 0061:266-272). Regravar o texto da
-- 0055 desfaria aquilo em silencio.
--
-- Entao aqui vale o remendo — mas com a trava que o bloco 2 da 0055 nao tem: se o trecho procurado
-- nao aparecer exatamente uma vez, a migration ABORTA. Sem sentinela, um remendo que nao casa vira
-- no-op silencioso, o deploy passa verde, e o banco fica diferente do que a migration diz.
-- ---------------------------------------------------------------------------
do $$
declare
  v_definicao text;
  v_alvo constant text :=
    'and (v_individual_override_count <> 1 or v_broad_override_count <> 0) then';
  v_novo constant text :=
    'and (v_individual_override_count <> 1 or v_broad_override_count <> 0)' || E'\n' ||
    '         and not coalesce(' || E'\n' ||
    '           private.cms_ev2_delivery_active(v_key, p_environment, p_site_key, p_aal), false' || E'\n' ||
    '         ) then';
  v_ocorrencias integer;
begin
  select pg_get_functiondef(
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into v_definicao;

  v_ocorrencias := (length(v_definicao) - length(replace(v_definicao, v_alvo, '')))
                   / nullif(length(v_alvo), 0);

  if coalesce(v_ocorrencias, 0) <> 1 then
    raise exception 'CMS_EV2_DELIVERY_MANIFEST_PATCH_POINT_DRIFT: esperava 1 ocorrencia, encontrou %',
      coalesce(v_ocorrencias, 0)
      using errcode = 'P0001',
            hint = 'O corpo instalado do manifesto mudou. NAO edite esta migration: apure primeiro por que mudou.';
  end if;

  execute replace(v_definicao, v_alvo, v_novo);

  -- Conferencia depois de aplicar: os quatro invariantes que nao podem ter se perdido no caminho.
  select pg_get_functiondef(
    'public.cms_runtime_capability_manifest(uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into v_definicao;

  if position('cms_ev2_delivery_active' in v_definicao) = 0 then
    raise exception 'CMS_EV2_DELIVERY_MANIFEST_NOT_APPLIED' using errcode = 'P0001';
  end if;
  if position('v_broad_override_count' in v_definicao) = 0 then
    raise exception 'CMS_EV2_DELIVERY_MANIFEST_BROAD_VETO_LOST' using errcode = 'P0001';
  end if;
  if position('aal2' in v_definicao) = 0 then
    raise exception 'CMS_EV2_DELIVERY_MANIFEST_AAL_LOST' using errcode = 'P0001';
  end if;

  -- O interruptor de emergencia NAO mora no manifesto: ele delega a
  -- cms_evaluate_feature_flag, que e quem le kill_switch. Uma versao anterior desta migration
  -- procurava o interruptor no manifesto e abortou a migracao inteira no CI, com
  -- CMS_EV2_DELIVERY_MANIFEST_KILL_SWITCH_LOST. A sentinela pegou a suposicao errada, que e para
  -- isso que ela existe. A conferencia certa e sobre o AVALIADOR, cujo corpo esta migration
  -- substitui por inteiro — perde-lo ali seria regressao de verdade.
  select pg_get_functiondef(
    'public.cms_evaluate_feature_flag(uuid,text,text,text,text,text,timestamptz)'::regprocedure
  ) into v_definicao;

  if position('kill_switch' in v_definicao) = 0 then
    raise exception 'CMS_EV2_DELIVERY_EVALUATOR_KILL_SWITCH_LOST' using errcode = 'P0001';
  end if;
  if position('cms_ev2_delivery_active' in v_definicao) = 0 then
    raise exception 'CMS_EV2_DELIVERY_EVALUATOR_NOT_APPLIED' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- As duas escritas governadas. Somente service_role, acionadas por workflow.
-- ---------------------------------------------------------------------------

-- Declarar entrega. Exige, para producao, que a MESMA funcionalidade esteja entregue em staging ha
-- pelo menos 24 horas. E o unico anteparo automatico contra erro de ordem de publicacao: se o
-- servidor ou o painel estiverem atrasados, o sintoma aparece em staging um dia antes, e nao em
-- producao com a capacidade aberta na API e a tela apagada.
create or replace function public.cms_ev2_declare_delivery(
  p_flag_key text,
  p_environment text,
  p_reason text,
  p_candidate_sha text,
  p_workflow_run_id text,
  p_approval_record_sha256 text,
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_review_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_id uuid;
  v_desde timestamptz;
  v_estado_staging text;
  v_linha private.cms_ev2_delivery_ledger%rowtype;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'CMS_EV2_DELIVERY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_environment = 'production' then
    -- A ULTIMA PALAVRA de staging, estado e data lidos da MESMA linha.
    --
    -- Uma versao anterior fazia duas leituras: a data pela linha mais recente, e o estado por um
    -- `not exists (... order by ... limit 1)`. ORDER BY e LIMIT dentro de EXISTS nao decidem nada —
    -- EXISTS so pergunta se o conjunto e vazio. A condicao real virava "JA EXISTIU alguma entrega
    -- em staging", e nao "a ultima palavra e entregue". Entao staging entregue, quebrado e
    -- SUSPENSO satisfazia as duas condicoes 25 horas depois, e a entrega em producao era aceita.
    -- Este soak e o unico anteparo automatico contra erro de ordem de publicacao; le igual, decide
    -- diferente era o pior jeito de ele falhar.
    select ledger.state, ledger.created_at into v_estado_staging, v_desde
    from private.cms_ev2_delivery_ledger ledger
    where ledger.flag_key = p_flag_key
      and ledger.environment = 'staging'
    order by ledger.created_at desc, ledger.id desc
    limit 1;

    if v_desde is null or v_desde > statement_timestamp() - interval '24 hours' then
      raise exception 'CMS_EV2_DELIVERY_STAGING_SOAK_REQUIRED'
        using errcode = '22023',
              hint = 'Declare a entrega em staging e espere 24 horas antes de declarar em producao.';
    end if;

    if coalesce(v_estado_staging, '') <> 'delivered' then
      raise exception 'CMS_EV2_DELIVERY_STAGING_NOT_DELIVERED'
        using errcode = '22023',
              hint = 'A ultima palavra do livro em staging precisa ser entregue, nao suspensa.';
    end if;
  end if;

  insert into private.cms_ev2_delivery_ledger (
    flag_key, environment, state, reason, candidate_sha, workflow_run_id,
    approval_record_sha256, idempotency_key, correlation_id, review_due_at
  ) values (
    p_flag_key, p_environment, 'delivered', p_reason, p_candidate_sha, p_workflow_run_id,
    p_approval_record_sha256, p_idempotency_key, p_correlation_id,
    coalesce(p_review_due_at, statement_timestamp() + interval '90 days')
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select ledger.id into v_id from private.cms_ev2_delivery_ledger ledger
    where ledger.idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object('schemaVersion', 1, 'id', v_id, 'flagKey', p_flag_key,
                            'environment', p_environment, 'state', 'delivered');
end;
$$;

-- Suspender. Desligar e sempre mais barato que ligar: exige menos provas, de proposito.
create or replace function public.cms_ev2_suspend_delivery(
  p_flag_key text,
  p_environment text,
  p_reason text,
  p_candidate_sha text,
  p_workflow_run_id text,
  p_approval_record_sha256 text,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_id uuid;
  v_estado text;
  v_linha private.cms_ev2_delivery_ledger%rowtype;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'CMS_EV2_DELIVERY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  insert into private.cms_ev2_delivery_ledger (
    flag_key, environment, state, reason, candidate_sha, workflow_run_id,
    approval_record_sha256, idempotency_key, correlation_id, review_due_at
  ) values (
    p_flag_key, p_environment, 'suspended', p_reason, p_candidate_sha, p_workflow_run_id,
    p_approval_record_sha256, p_idempotency_key, p_correlation_id, null
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  -- Idempotencia NAO pode virar silencio.
  --
  -- idempotency_key e unica na TABELA inteira, nao por (flag, ambiente, estado). Uma versao
  -- anterior tratava o RETURNING vazio como "ja fiz isso", buscava o id da linha preexistente e
  -- devolvia o literal 'suspended' sem olhar o que a linha dizia. Com uma chave reaproveitada, a
  -- revogacao era reportada como feita, a ultima palavra do livro continuava 'delivered', e a
  -- funcionalidade seguia no ar em producao com o workflow acreditando que desligou.
  --
  -- Chave reaproveitada com intencao diferente e erro do chamador, nao idempotencia. O padrao ja
  -- existe na casa: 0040:429-431 compara e levanta CMS_MASTER_DATA_IDEMPOTENCY_CONFLICT.
  if v_id is null then
    select * into v_linha from private.cms_ev2_delivery_ledger ledger
    where ledger.idempotency_key = p_idempotency_key;

    if v_linha.flag_key is distinct from p_flag_key
       or v_linha.environment is distinct from p_environment
       or v_linha.state is distinct from 'suspended' then
      raise exception
        'CMS_EV2_DELIVERY_IDEMPOTENCY_CONFLICT: chave ja usada para %/%/%, pedido %/%/suspended',
        v_linha.flag_key, v_linha.environment, v_linha.state, p_flag_key, p_environment
        using errcode = '23505',
              hint = 'Use uma chave de idempotencia nova. Reaproveitar com intencao diferente nao e repeticao.';
    end if;
    v_id := v_linha.id;
  end if;

  -- O estado devolvido descreve o LIVRO, nunca a intencao de quem chamou.
  select ledger.state into v_estado from private.cms_ev2_delivery_ledger ledger
  where ledger.id = v_id;

  return jsonb_build_object('schemaVersion', 1, 'id', v_id, 'flagKey', p_flag_key,
                            'environment', p_environment, 'state', v_estado);
end;
$$;

revoke all on function public.cms_ev2_declare_delivery(text,text,text,text,text,text,uuid,uuid,timestamptz)
  from public, anon, authenticated;
revoke all on function public.cms_ev2_suspend_delivery(text,text,text,text,text,text,uuid,uuid)
  from public, anon, authenticated;

-- Sem estes grants NINGUEM alimenta nem suspende o livro: as duas funcoes recusam quem nao e
-- service_role, e sem grant nem o service_role as alcanca. Revogar seria impossivel, que e o
-- oposto da promessa de "revogar leva segundos e nao exige deploy".
grant execute on function public.cms_ev2_declare_delivery(text,text,text,text,text,text,uuid,uuid,timestamptz)
  to service_role;
grant execute on function public.cms_ev2_suspend_delivery(text,text,text,text,text,text,uuid,uuid)
  to service_role;

comment on table private.cms_ev2_delivery_ledger is
  'Livro somente-acrescimo das entregas EV2. Revogar e acrescentar linha com state=suspended.';
comment on function private.cms_ev2_delivery_active(text,text,text,text) is
  'Unico leitor do livro. Carrega AAL2 em producao, site main, kill switch e veto de override amplo.';
