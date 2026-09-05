-- Remove a lint-only unused record from form publication without changing behavior.

create or replace function public.cms_publish_form_version(
  p_actor_id uuid,
  p_form_id uuid,
  p_version_id uuid,
  p_aal text,
  p_session_id text,
  p_issued_at timestamptz,
  p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.cms_actor_authorized(p_actor_id,'cms:forms.publish',p_aal,p_session_id,p_issued_at) then
    raise exception 'CMS_COMMAND_FORBIDDEN' using errcode='42501';
  end if;
  perform 1 from public.cms_form_versions where id=p_version_id and form_id=p_form_id;
  if not found then raise exception 'CMS_FORM_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  update public.cms_form_versions set status='retired' where form_id=p_form_id and status='published';
  update public.cms_form_versions set status='published',published_at=now() where id=p_version_id;
  update public.cms_form_definitions set status='published',active_version_id=p_version_id,updated_by=p_actor_id where id=p_form_id;
  insert into public.cms_audit_log(actor_id,action,target_type,target_id,event_data,correlation_id)
  values(p_actor_id,'cms:form.publish','form',p_form_id::text,jsonb_build_object('versionId',p_version_id),p_correlation_id);
  return jsonb_build_object('formId',p_form_id,'versionId',p_version_id,'status','published');
end $$;

revoke all on function public.cms_publish_form_version(uuid,uuid,uuid,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.cms_publish_form_version(uuid,uuid,uuid,text,text,timestamptz,uuid) to service_role;
