-- Fase 1 — hardening indicado pelo Security Advisor no staging.
-- A policy self-only evita recursão e permite que os helpers sejam invoker.

drop policy if exists "rdo_access_self_or_admin" on public.rdo_user_access;
create policy "rdo_access_self"
  on public.rdo_user_access for select to authenticated
  using (user_id = auth.uid());

create or replace function public.rdo_user_is_active(target_user uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rdo_user_access a
    where a.user_id = target_user and a.active
  );
$$;

create or replace function public.rdo_is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rdo_user_access a
    where a.user_id = target_user and a.active and a.role = 'rdo_admin'
  );
$$;

alter function public.rdo_touch_updated_at() set search_path = public, pg_temp;

revoke all on function public.rdo_user_is_active(uuid) from public, anon;
revoke all on function public.rdo_is_admin(uuid) from public, anon;
grant execute on function public.rdo_user_is_active(uuid) to authenticated, service_role;
grant execute on function public.rdo_is_admin(uuid) to authenticated, service_role;
