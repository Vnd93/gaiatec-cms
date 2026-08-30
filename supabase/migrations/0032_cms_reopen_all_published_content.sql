-- Permite abrir uma nova versão de qualquer conteúdo publicado sem retirar a
-- projeção vigente. Arquivar conteúdo público sempre exige a mesma permissão
-- crítica usada para publicar.

create or replace function public.cms_editorial_required_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_action in ('create','save','submit','trash','preview') then public.cms_content_permission(p_content_type,'edit')
    when p_action='archive' then public.cms_content_permission(p_content_type,'publish')
    when p_action='approve' and p_content_type='post' then 'cms:posts.approve'
    when p_action='approve' and p_content_type='campaign' then 'cms:campaigns.approve'
    when p_action='approve' then public.cms_content_permission(p_content_type,'publish')
    when p_action in ('schedule','publish','restore') then public.cms_content_permission(p_content_type,'publish')
    else null end;
$$;

create or replace function public.cms_reopen_site_builder(
  p_actor_id uuid,p_item_id uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,
  p_idempotency_key uuid,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.cms_content_items%rowtype; result jsonb; permission text;
begin
  select * into item from public.cms_content_items where id=p_item_id for update;
  if not found then raise exception 'CMS_CONTENT_NOT_FOUND' using errcode='P0002'; end if;
  permission:=public.cms_content_permission(item.content_type,'edit');
  if permission is null
     or not public.cms_actor_authorized(p_actor_id,permission,p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  select response into result from public.cms_editorial_command_receipts
  where actor_id=p_actor_id and action='reopen' and idempotency_key=p_idempotency_key;
  if found and result is not null then return result; end if;
  if item.workflow_status<>'published'
     or not exists(select 1 from public.cms_published_projection projection where projection.item_id=item.id) then
    raise exception 'CMS_TRANSITION_INVALID' using errcode='23514';
  end if;
  insert into public.cms_editorial_command_receipts(actor_id,action,idempotency_key,item_id,correlation_id)
  values(p_actor_id,'reopen',p_idempotency_key,item.id,p_correlation_id) on conflict do nothing;
  update public.cms_content_items set workflow_status='draft',updated_by=p_actor_id,updated_at=now()
  where id=item.id;
  result:=jsonb_build_object('itemId',item.id,'status','draft','liveProjectionPreserved',true);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:content.reopen','content_item',item.id::text,
    jsonb_build_object('reason',p_reason,'contentType',item.content_type,'liveProjectionPreserved',true),p_correlation_id);
  update public.cms_editorial_command_receipts set response=result
  where actor_id=p_actor_id and action='reopen' and idempotency_key=p_idempotency_key;
  return result;
end $$;

revoke all on function public.cms_editorial_required_permission(text,text) from public,anon;
revoke all on function public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cms_editorial_required_permission(text,text) to authenticated,service_role;
grant execute on function public.cms_reopen_site_builder(uuid,uuid,text,text,text,timestamptz,uuid,uuid) to service_role;
