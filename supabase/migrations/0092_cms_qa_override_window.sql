begin;

-- A 0091 estendeu o prazo da lease do ator sintetico para 240 minutos, mas a janela das sobreposicoes
-- de feature flag deriva desse mesmo prazo e tem teto proprio, ainda em 120 minutos. Com os dois em
-- desacordo, `private.cms_qa_override_window_is_valid` recusava a janela de 240 minutos, o manifesto de
-- capacidades marcava cada flag como indisponivel, e o provisionamento do ator reprovava com
-- QA_CMS_FIXTURE_SESSION_NOT_READY:200:granted:no_capabilities, ou seja, sessao valida, acesso
-- concedido e nenhuma capacidade.
--
-- Esta mudanca nasce separada, e nao dentro da 0091, porque a 0091 ja estava aplicada quando a
-- necessidade apareceu. Alterar uma migration ja aplicada nao a reexecuta: o registro de versao
-- permanece e o efeito nunca chega ao banco, que foi exatamente o que aconteceu e custou dois ciclos.
--
-- Como em 0091, a definicao instalada e ajustada e nao reescrita, para nao reverter nenhum reparo que
-- tenha sido aplicado a esta funcao depois da migration que a criou.

do $qa_override_window$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(
    'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
  ) into v_definition;
  v_original := v_definition;

  if position($old$interval '120 minutes'$old$ in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      $old$interval '120 minutes'$old$,
      $new$interval '241 minutes'$new$
    );
  elsif position($new$interval '241 minutes'$new$ in v_definition) = 0 then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_DRIFT' using errcode = 'P0001';
  end if;

  if v_definition is distinct from v_original then
    execute v_definition;
  end if;
end;
$qa_override_window$;

do $qa_override_window_probe$
declare
  v_definition text;
begin
  v_definition := regexp_replace(
    pg_get_functiondef(
      'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)'::regprocedure
    ),
    '[[:space:]]+', ' ', 'g'
  );
  if v_definition !~ 'interval ''241 minutes''' then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_NOT_APPLIED' using errcode = '55000';
  end if;
  -- A excecao so vale para a lease QA exata e continua exigindo lease ativa e marcador exato. Nada
  -- disso pode ter sido perdido no ajuste.
  if v_definition !~ 'cms_qa_actor_marker_is_exact'
     or v_definition !~ 'status = ''active'''
     or v_definition !~ 'p_expires_at > p_starts_at' then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_GUARDS_LOST' using errcode = '55000';
  end if;
  if has_function_privilege('authenticated',
       'private.cms_qa_override_window_is_valid(uuid,text,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'CMS_QA_OVERRIDE_WINDOW_PRIVILEGE_WIDENED' using errcode = '55000';
  end if;
end;
$qa_override_window_probe$;

commit;
