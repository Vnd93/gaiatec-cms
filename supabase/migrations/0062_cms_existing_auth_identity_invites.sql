-- Impede divergência entre a identidade Auth nominal e o endereço exibido no
-- perfil CMS. O fluxo cms-users pode, assim, vincular com segurança uma conta
-- já usada pelo RDO sem copiar suas permissões para o CMS.

create or replace function public.cms_enforce_profile_auth_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.display_email is not null and not exists (
    select 1
    from auth.users identity
    where identity.id = new.user_id
      and lower(identity.email) = lower(new.display_email)
  ) then
    raise exception 'CMS_PROFILE_AUTH_EMAIL_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cms_profiles_auth_email_guard
before insert or update of user_id, display_email on public.cms_profiles
for each row execute function public.cms_enforce_profile_auth_email();

revoke all on function public.cms_enforce_profile_auth_email()
from public, anon, authenticated;

-- Uma identidade pode autenticar em outros produtos enquanto seu acesso ao
-- CMS está suspenso. Ao reativar o perfil, invalide também tokens Auth que
-- tenham sido emitidos durante a suspensão, sem alterar o ban global de Auth.
create or replace function public.cms_invalidate_sessions_on_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'suspended' and new.status = 'active' then
    new.sessions_valid_after := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger cms_profiles_reactivation_session_guard
before update of status on public.cms_profiles
for each row execute function public.cms_invalidate_sessions_on_reactivation();

revoke all on function public.cms_invalidate_sessions_on_reactivation()
from public, anon, authenticated;
