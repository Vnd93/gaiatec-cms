-- Fase 3 — editar um publicado abre novo rascunho sem tocar na projeção válida.

create or replace function public.cms_editorial_transition_allowed(p_from text, p_action text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p_action
    when 'save' then p_from in ('draft', 'in_review', 'approved', 'published')
    when 'submit' then p_from = 'draft'
    when 'approve' then p_from = 'in_review'
    when 'schedule' then p_from = 'approved'
    when 'publish' then p_from in ('approved', 'scheduled')
    when 'restore' then p_from in ('published', 'archived')
    when 'archive' then p_from in ('draft', 'in_review', 'approved', 'scheduled', 'published')
    when 'trash' then p_from in ('draft', 'archived')
    else false
  end;
$$;

create function public.cms_open_draft_after_edit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.cms_content_items where id = new.item_id and workflow_status in ('published', 'approved')) then
    update public.cms_content_items set workflow_status = 'draft', archived_at = null, scheduled_for = null,
      updated_by = new.updated_by where id = new.item_id;
  end if;
  return new;
end;
$$;

create trigger cms_draft_edit_opens_workflow after update of payload, seo, provenance
on public.cms_content_drafts for each row execute function public.cms_open_draft_after_edit();

revoke all on function public.cms_open_draft_after_edit() from public, anon, authenticated;
