param([Parameter(Mandatory = $true)][string]$SecretFile)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"
$ProjectUrl = "https://$TargetRef.supabase.co"
$tokenLines = @(Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' | ForEach-Object { $_.Line })
if ($tokenLines.Count -ne 1) { throw "Esperada exatamente uma linha SUPABASE_ACCESS_TOKEN." }
$managementToken = (($tokenLines[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
$managementHeaders = @{ Authorization = "Bearer $managementToken"; "Content-Type" = "application/json" }
$project = Invoke-RestMethod -Method Get -Uri $ManagementUrl -Headers $managementHeaders
if ($project.ref -ne $TargetRef -or $project.name -ne "GAIATEC CMS Staging" -or $project.region -ne "us-east-2") { throw "ALVO RECUSADO." }
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key

$lookupSql = @"
select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'path',a.storage_path)) filter (where u.id is not null), '[]'::jsonb) fixtures
from auth.users u left join public.cms_media_assets a on a.created_by=u.id
where u.raw_user_meta_data ->> 'synthetic' = 'true' and u.raw_user_meta_data ->> 'phase' = '4';
"@
$lookup = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $lookupSql; read_only = $true } | ConvertTo-Json -Compress)
$fixtures = @($lookup[0].fixtures)
foreach ($fixture in $fixtures) {
  if ($fixture.path) {
    $prefix = $fixture.path -replace '/original\.[a-z0-9]+$', ''
    $listed = Invoke-RestMethod -Method Post -Uri "$ProjectUrl/storage/v1/object/list/cms-media-private" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } -ContentType "application/json" -Body (@{ prefix = $prefix; limit = 100 } | ConvertTo-Json -Compress)
    foreach ($object in @($listed)) {
      $path = "$prefix/$($object.name)"
      $null = Invoke-WebRequest -Method Delete -Uri "$ProjectUrl/storage/v1/object/cms-media-private/$path" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } -SkipHttpErrorCheck
    }
  }
}

$cleanupSql = @"
begin;
create temp table f4_cleanup_users as select id from auth.users where raw_user_meta_data ->> 'synthetic' = 'true' and raw_user_meta_data ->> 'phase' = '4';
delete from public.cms_media_usages where item_id in (select id from public.cms_content_items where created_by in (select id from f4_cleanup_users));
delete from public.cms_media_variants where asset_id in (select id from public.cms_media_assets where created_by in (select id from f4_cleanup_users));
delete from public.cms_media_assets where created_by in (select id from f4_cleanup_users);
delete from public.cms_operational_events where item_id in (select id from public.cms_content_items where created_by in (select id from f4_cleanup_users));
delete from public.cms_preview_tokens where created_by in (select id from f4_cleanup_users);
delete from public.cms_publication_outbox where item_id in (select id from public.cms_content_items where created_by in (select id from f4_cleanup_users));
delete from public.cms_publications where item_id in (select id from public.cms_content_items where created_by in (select id from f4_cleanup_users));
delete from public.cms_published_projection where item_id in (select id from public.cms_content_items where created_by in (select id from f4_cleanup_users));
alter table public.cms_content_approvals disable trigger cms_approvals_immutable;
delete from public.cms_content_approvals where reviewer_id in (select id from f4_cleanup_users);
alter table public.cms_content_approvals enable trigger cms_approvals_immutable;
delete from public.cms_editorial_command_receipts where actor_id in (select id from f4_cleanup_users);
alter table public.cms_content_revisions disable trigger cms_revisions_immutable;
delete from public.cms_content_revisions where created_by in (select id from f4_cleanup_users);
alter table public.cms_content_revisions enable trigger cms_revisions_immutable;
delete from public.cms_content_drafts where updated_by in (select id from f4_cleanup_users);
delete from public.cms_content_items where created_by in (select id from f4_cleanup_users);
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id in (select id from f4_cleanup_users);
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id in (select id from f4_cleanup_users);
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id in (select id from f4_cleanup_users);
delete from public.cms_command_receipts where actor_id in (select id from f4_cleanup_users) or target_user_id in (select id from f4_cleanup_users);
delete from public.cms_user_roles where user_id in (select id from f4_cleanup_users);
delete from public.cms_profiles where user_id in (select id from f4_cleanup_users);
delete from auth.users where id in (select id from f4_cleanup_users);
delete from public.request_rate_limits;
commit;
"@
$null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress)
$managementToken = $null; $serviceKey = $null
Write-Output "Phase 4 synthetic fixtures removed from staging."
