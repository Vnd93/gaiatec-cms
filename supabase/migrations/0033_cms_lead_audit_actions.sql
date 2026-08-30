-- Normaliza as ações de leads para o namespace obrigatório do log imutável.

create or replace function public.cms_manage_lead(p_actor_id uuid,p_lead_id uuid,p_status text,p_assigned_to uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare lead_row public.cms_leads%rowtype; old_status text; old_assignee uuid;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:leads.assign',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select * into lead_row from public.cms_leads where id=p_lead_id for update;
  if not found or lead_row.status='anonymized' then raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002'; end if;
  if p_status not in ('new','assigned','in_service','responded','converted','disqualified','archived') then raise exception 'CMS_LEAD_STATUS_INVALID' using errcode='23514'; end if;
  old_status:=lead_row.status; old_assignee:=lead_row.assigned_to;
  update public.cms_leads set status=p_status,assigned_to=p_assigned_to,last_activity_at=now() where id=p_lead_id;
  insert into public.cms_lead_status_history(lead_id,from_status,to_status,from_assignee,to_assignee,reason,actor_id) values(p_lead_id,old_status,p_status,old_assignee,p_assigned_to,p_reason,p_actor_id);
  insert into public.cms_lead_outbox(lead_id,event_type,idempotency_key,correlation_id) values(p_lead_id,case when old_assignee is distinct from p_assigned_to then 'lead_assigned' else 'lead_status_changed' end,gen_random_uuid(),p_correlation_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'cms:leads.update','lead',p_lead_id::text,jsonb_build_object('from',old_status,'to',p_status,'assignedTo',p_assigned_to),p_correlation_id);
  return jsonb_build_object('leadId',p_lead_id,'status',p_status,'assignedTo',p_assigned_to);
end $$;

create or replace function public.cms_export_leads(p_actor_id uuid,p_status text,p_justification text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; rows_count integer;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:leads.export',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('reference',reference_code,'status',status,'createdAt',created_at,'originPath',origin_path,'originSource',origin_source,'utm',utm,'fields',payload) order by created_at desc),'[]'::jsonb),count(*)
  into result,rows_count
  from (select reference_code,status,created_at,origin_path,origin_source,utm,payload from public.cms_leads where anonymized_at is null and (p_status is null or status=p_status) order by created_at desc limit 5000) exported;
  insert into public.cms_lead_exports(actor_id,filter_snapshot,row_count,justification,correlation_id) values(p_actor_id,jsonb_build_object('status',p_status,'limit',5000),rows_count,p_justification,p_correlation_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'cms:leads.export','lead_export',p_correlation_id::text,jsonb_build_object('rowCount',rows_count,'status',p_status),p_correlation_id);
  return jsonb_build_object('rows',result,'rowCount',rows_count,'correlationId',p_correlation_id);
end $$;

create or replace function public.cms_anonymize_lead(p_actor_id uuid,p_lead_id uuid,p_reason text,p_aal text,p_session_id text,p_issued_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old_status text;
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:leads.privacy',p_aal,p_session_id,p_issued_at) then raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501'; end if;
  select status into old_status from public.cms_leads where id=p_lead_id and anonymized_at is null for update;
  if not found then raise exception 'CMS_LEAD_NOT_FOUND' using errcode='P0002'; end if;
  update public.cms_leads set payload='{}'::jsonb,utm='{}'::jsonb,assigned_to=null,status='anonymized',anonymized_at=now(),last_activity_at=now() where id=p_lead_id;
  insert into public.cms_lead_status_history(lead_id,from_status,to_status,reason,actor_id) values(p_lead_id,old_status,'anonymized',p_reason,p_actor_id);
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id) values(p_actor_id,'cms:leads.anonymize','lead',p_lead_id::text,jsonb_build_object('from',old_status,'reason',p_reason),p_correlation_id);
  return jsonb_build_object('leadId',p_lead_id,'status','anonymized');
end $$;

revoke all on function public.cms_manage_lead(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_export_leads(uuid,text,text,text,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.cms_anonymize_lead(uuid,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cms_manage_lead(uuid,uuid,text,uuid,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_export_leads(uuid,text,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.cms_anonymize_lead(uuid,uuid,text,text,text,timestamptz,uuid) to service_role;
