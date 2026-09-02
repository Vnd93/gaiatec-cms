-- Restaura a separação de funções no workflow editorial. A migração 0032
-- generalizou aprovações para a permissão de publicação e, com isso, impediu
-- revisores de aprovar tipos que possuem uma permissão *.approve dedicada.

create or replace function public.cms_editorial_required_permission(p_content_type text,p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_action in ('create','save','submit','trash','preview') then public.cms_content_permission(p_content_type,'edit')
    when p_action='archive' then public.cms_content_permission(p_content_type,'publish')
    when p_action='approve' and p_content_type='post' then 'cms:posts.approve'
    when p_action='approve' and p_content_type='campaign' then 'cms:campaigns.approve'
    when p_action='approve' and p_content_type='product' then 'cms:products.approve'
    when p_action='approve' and p_content_type='service' then 'cms:services.approve'
    when p_action='approve' and p_content_type='industry' then 'cms:industries.approve'
    when p_action='approve' and p_content_type='application' then 'cms:applications.approve'
    when p_action='approve' and p_content_type='solution' then 'cms:solutions.approve'
    when p_action='approve' and p_content_type='page' then 'cms:pages.approve'
    when p_action='approve' and p_content_type='homepage' then 'cms:homepage.approve'
    when p_action='approve' and p_content_type='navigation' then 'cms:navigation.approve'
    when p_action='approve' and p_content_type='site_settings' then 'cms:settings.approve'
    when p_action='approve' and p_content_type='placement' then 'cms:placements.approve'
    when p_action in ('schedule','publish','restore') then public.cms_content_permission(p_content_type,'publish')
    else null end;
$$;

revoke all on function public.cms_editorial_required_permission(text,text) from public,anon;
grant execute on function public.cms_editorial_required_permission(text,text) to authenticated,service_role;
