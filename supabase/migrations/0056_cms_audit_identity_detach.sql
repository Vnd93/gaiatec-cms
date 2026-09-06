-- Permite a remoção controlada de uma identidade sem apagar ou reescrever
-- evidências imutáveis. A única mutação aceita é a ação referencial do
-- ON DELETE SET NULL sobre o identificador do usuário.

create or replace function private.cms_allow_identity_detach()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity_column text := tg_argv[0];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE'
    and v_identity_column in ('actor_id', 'user_id')
    and v_old -> v_identity_column <> 'null'::jsonb
    and v_new -> v_identity_column = 'null'::jsonb
    and (v_old - v_identity_column) = (v_new - v_identity_column)
  then
    return new;
  end if;

  raise exception 'CMS audit records are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists cms_login_events_immutable on public.cms_login_events;
create trigger cms_login_events_immutable
before update or delete on public.cms_login_events
for each row execute function private.cms_allow_identity_detach('user_id');

drop trigger if exists cms_audit_log_immutable on public.cms_audit_log;
create trigger cms_audit_log_immutable
before update or delete on public.cms_audit_log
for each row execute function private.cms_allow_identity_detach('actor_id');

drop trigger if exists cms_policy_decisions_immutable on public.cms_policy_decisions;
create trigger cms_policy_decisions_immutable
before update or delete on public.cms_policy_decisions
for each row execute function private.cms_allow_identity_detach('actor_id');

revoke all on function private.cms_allow_identity_detach() from public, anon, authenticated;

