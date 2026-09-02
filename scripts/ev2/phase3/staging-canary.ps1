param(
  [Parameter(Mandatory = $true)]
  [string]$SecretFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ExpectedName = "GAIATEC CMS Staging"
$ExpectedRegion = "us-east-2"
$ProjectUrl = "https://$TargetRef.supabase.co"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"
$AllowedOrigin = "https://gaiatec-cms-staging.pages.dev"

$tokenLines = @(Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' | ForEach-Object { $_.Line })
if ($tokenLines.Count -ne 1) { throw "Esperada exatamente uma linha SUPABASE_ACCESS_TOKEN." }
$managementToken = (($tokenLines[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($managementToken)) { throw "SUPABASE_ACCESS_TOKEN vazio." }

$managementHeaders = @{ Authorization = "Bearer $managementToken"; "Content-Type" = "application/json" }
$project = Invoke-RestMethod -Method Get -Uri $ManagementUrl -Headers $managementHeaders
if ($project.ref -ne $TargetRef -or $project.name -ne $ExpectedName -or $project.region -ne $ExpectedRegion) {
  throw "ALVO RECUSADO: ref, nome ou região não correspondem ao staging autorizado."
}
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if ([string]::IsNullOrWhiteSpace($anonKey) -or [string]::IsNullOrWhiteSpace($serviceKey)) {
  throw "Chaves exclusivas do staging indisponíveis."
}

$results = [System.Collections.Generic.List[object]]::new()
$userId = $null
$overrideId = $null
$entityIds = [System.Collections.Generic.List[string]]::new()
$password = "Ev2!$([guid]::NewGuid().ToString('N'))"
$email = "ev2-g3-$([guid]::NewGuid().ToString('N'))@example.invalid"

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $arguments = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true; TimeoutSec = 25 }
  if ($null -ne $Body) {
    $arguments.ContentType = "application/json"
    $arguments.Body = $Body | ConvertTo-Json -Depth 30 -Compress
  }
  $response = Invoke-WebRequest @arguments
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 40 } catch { $json = $null } }
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json }
}

function Assert-Check {
  param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Condition) { "PASS" } else { "FAIL" }); Detail = $Detail })
  if ($Condition) { Write-Host "PASS $Name — $Detail" } else { throw "Falha em $Name ($Detail)" }
}

function New-Envelope {
  param([Nullable[int]]$ExpectedVersion = $null, [string]$Environment = "staging")
  $value = @{
    schemaVersion = 1
    commandId = [guid]::NewGuid().ToString()
    correlationId = [guid]::NewGuid().ToString()
    occurredAt = [DateTime]::UtcNow.ToString("o")
    actorContext = @{ environment = $Environment; siteKey = "main" }
  }
  if ($null -ne $ExpectedVersion) { $value.expectedVersion = [int]$ExpectedVersion }
  return $value
}

function Invoke-MasterCommand {
  param([string]$Token, [object]$Body, [string]$IdempotencyKey = "")
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin }
  if ($IdempotencyKey) { $headers["X-Idempotency-Key"] = $IdempotencyKey }
  return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/cms-master-data" -Headers $headers -Body $Body
}

try {
  $created = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/admin/users" -Headers @{
    apikey = $serviceKey; Authorization = "Bearer $serviceKey"
  } -Body @{
    email = $email; password = $password; email_confirm = $true
    user_metadata = @{ synthetic = $true; phase = "ev2-g3" }
  }
  Assert-Check "synthetic_user_created" ($created.Status -eq 200 -and $created.Json.id) "HTTP $($created.Status)"
  $userId = [string]$created.Json.id
  $serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=representation" }

  $profile = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_profiles" -Headers $serviceHeaders -Body @{
    user_id = $userId; display_name = "Steward sintético EV2 G3"; display_email = $email; status = "active"
  }
  Assert-Check "synthetic_profile_created" ($profile.Status -eq 201) "HTTP $($profile.Status)"
  $role = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_user_roles" -Headers $serviceHeaders -Body @{
    user_id = $userId; role_key = "technical"
  }
  Assert-Check "technical_role_assigned" ($role.Status -eq 201) "HTTP $($role.Status)"
  $override = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides" -Headers $serviceHeaders -Body @{
    flag_key = "ev2.master_data"; environment = "staging"; scope_type = "user"; scope_key = $userId
    enabled = $true; reason = "Canary técnico sintético e descartável do Gate G3"
    starts_at = [DateTime]::UtcNow.AddSeconds(-5).ToString("o")
    expires_at = [DateTime]::UtcNow.AddMinutes(30).ToString("o"); created_by = $userId
  }
  Assert-Check "user_flag_enabled" ($override.Status -eq 201 -and @($override.Json).Count -eq 1) "HTTP $($override.Status)"
  $overrideId = [string]@($override.Json)[0].id

  $signIn = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } -Body @{
    email = $email; password = $password
  }
  Assert-Check "synthetic_signin" ($signIn.Status -eq 200 -and $signIn.Json.access_token) "HTTP $($signIn.Status)"
  $token = [string]$signIn.Json.access_token
  $capability = Invoke-MasterCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope }
  Assert-Check "capability_user_override" ($capability.Status -eq 200 -and $capability.Json.enabled -eq $true) "HTTP $($capability.Status)"
  $rules = Invoke-MasterCommand -Token $token -Body @{ action = "list_rules"; envelope = New-Envelope }
  Assert-Check "relation_rules_loaded" ($rules.Status -eq 200 -and @($rules.Json.rules).Count -eq 6) "HTTP $($rules.Status)"

  function New-SyntheticEntity {
    param([string]$Type, [string]$Name)
    $response = Invoke-MasterCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
      action = "create_entity"; envelope = New-Envelope; entityType = $Type; name = $Name; sourceType = "manual"
      sourceRef = "canary-g3"
    }
    if ($response.Status -eq 200 -and $response.Json.entityId) { $entityIds.Add([string]$response.Json.entityId) }
    return $response
  }

  $suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
  $category = New-SyntheticEntity -Type "category" -Name "G3 Categoria $suffix"
  $technologyA = New-SyntheticEntity -Type "technology" -Name "G3 Infravermelho $suffix"
  $technologyB = New-SyntheticEntity -Type "technology" -Name "G3 Laser $suffix"
  Assert-Check "entities_created" (
    $category.Status -eq 200 -and $technologyA.Status -eq 200 -and $technologyB.Status -eq 200
  ) "3 entidades HTTP 200"

  $alias = Invoke-MasterCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "upsert_alias"; envelope = New-Envelope -ExpectedVersion 1
    entityId = [string]$technologyA.Json.entityId; alias = "G3 IR $suffix"; sourceType = "manual"
  }
  Assert-Check "alias_created" ($alias.Status -eq 200 -and $alias.Json.lockVersion -eq 2) "HTTP $($alias.Status)"
  $search = Invoke-MasterCommand -Token $token -Body @{
    action = "list_entities"; envelope = New-Envelope; entityType = "technology"; query = "G3 IR $suffix"
  }
  Assert-Check "alias_search_resolves_entity" (
    $search.Status -eq 200 -and @($search.Json.entities).Count -eq 1 -and $search.Json.entities[0].id -eq $technologyA.Json.entityId
  ) "HTTP $($search.Status)"
  $duplicate = New-SyntheticEntity -Type "category" -Name "G3 Categória $suffix"
  Assert-Check "normalized_duplicate_blocked" ($duplicate.Status -eq 409) "HTTP $($duplicate.Status)"

  foreach ($target in @($technologyA, $technologyB)) {
    $linked = Invoke-MasterCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
      action = "upsert_compatibility"; envelope = New-Envelope; relationType = "category_technology"
      sourceEntityId = [string]$category.Json.entityId; targetEntityId = [string]$target.Json.entityId
      sourceType = "manual"; sourceRef = "canary-g3"
    }
    Assert-Check "compatibility_$($target.Json.entityId.ToString().Substring(0, 8))" ($linked.Status -eq 200) "HTTP $($linked.Status)"
  }
  $dependencies = Invoke-MasterCommand -Token $token -Body @{
    action = "get_dependencies"; envelope = New-Envelope; relationType = "category_technology"
    sourceEntityId = [string]$category.Json.entityId
  }
  Assert-Check "dependent_list_has_only_linked_targets" (
    $dependencies.Status -eq 200 -and @($dependencies.Json.compatibilities).Count -eq 2
  ) "HTTP $($dependencies.Status)"

  $inactive = Invoke-MasterCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "set_entity_status"; envelope = New-Envelope -ExpectedVersion 1
    entityId = [string]$technologyB.Json.entityId; status = "inactive"; reason = "Canary de histórico"
  }
  Assert-Check "entity_inactivated" ($inactive.Status -eq 200 -and $inactive.Json.status -eq "inactive") "HTTP $($inactive.Status)"
  $activeDependencies = Invoke-MasterCommand -Token $token -Body @{
    action = "get_dependencies"; envelope = New-Envelope; relationType = "category_technology"
    sourceEntityId = [string]$category.Json.entityId
  }
  $historicalDependencies = Invoke-MasterCommand -Token $token -Body @{
    action = "get_dependencies"; envelope = New-Envelope; relationType = "category_technology"
    sourceEntityId = [string]$category.Json.entityId; includeInactive = $true
  }
  Assert-Check "inactive_target_hidden_but_history_preserved" (
    @($activeDependencies.Json.compatibilities).Count -eq 1 -and @($historicalDependencies.Json.compatibilities).Count -eq 2
  ) "1 ativa; 2 históricas"

  $publicRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/cms_master_entities?select=id&limit=1" -Headers @{
    apikey = $anonKey; Authorization = "Bearer $anonKey"
  }
  Assert-Check "anonymous_master_read_denied" ($publicRead.Status -in @(401, 403)) "HTTP $($publicRead.Status)"
  $production = Invoke-MasterCommand -Token $token -Body @{
    action = "capability"; envelope = New-Envelope -Environment "production"
  }
  Assert-Check "production_rejected" (
    $production.Status -eq 403 -and $production.Json.code -eq "CMS_MASTER_DATA_PRODUCTION_GATED"
  ) "HTTP $($production.Status)"
  $disabled = Invoke-Api -Method Patch -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides?id=eq.$overrideId" -Headers $serviceHeaders -Body @{
    enabled = $false; reason = "Canary G3 concluído; kill switch escopado validado"
    expires_at = [DateTime]::UtcNow.AddMinutes(1).ToString("o")
  }
  Assert-Check "scoped_kill_switch_applied" ($disabled.Status -eq 200) "HTTP $($disabled.Status)"
  $capabilityOff = Invoke-MasterCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope }
  Assert-Check "scoped_kill_switch_effective" ($capabilityOff.Status -eq 200 -and $capabilityOff.Json.enabled -eq $false) "HTTP $($capabilityOff.Status)"
}
finally {
  if ($userId) {
    [void][guid]::Parse($userId)
    $cleanupSql = @"
begin;
delete from public.cms_master_data_command_receipts where actor_id = '$userId'::uuid;
alter table public.cms_master_data_events disable trigger cms_master_data_events_immutable;
delete from public.cms_master_data_events where actor_id = '$userId'::uuid;
alter table public.cms_master_data_events enable trigger cms_master_data_events_immutable;
alter table public.cms_master_compatibilities disable trigger cms_master_compatibilities_no_delete;
delete from public.cms_master_compatibilities where created_by = '$userId'::uuid;
alter table public.cms_master_compatibilities enable trigger cms_master_compatibilities_no_delete;
alter table public.cms_master_entity_aliases disable trigger cms_master_aliases_no_delete;
delete from public.cms_master_entity_aliases where created_by = '$userId'::uuid;
alter table public.cms_master_entity_aliases enable trigger cms_master_aliases_no_delete;
alter table public.cms_master_entities disable trigger cms_master_entities_no_delete;
delete from public.cms_master_entities where created_by = '$userId'::uuid;
alter table public.cms_master_entities enable trigger cms_master_entities_no_delete;
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id = '$userId'::uuid and action like 'cms:masterdata.%';
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
delete from public.cms_feature_flag_overrides where created_by = '$userId'::uuid;
delete from public.cms_user_roles where user_id = '$userId'::uuid;
delete from public.cms_profiles where user_id = '$userId'::uuid;
commit;
"@
    try {
      $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (
        @{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress
      )
      $null = Invoke-Api -Method Delete -Uri "$ProjectUrl/auth/v1/admin/users/$userId" -Headers @{
        apikey = $serviceKey; Authorization = "Bearer $serviceKey"
      }
    }
    catch { Write-Warning "A limpeza sintética exige auditoria manual." }
  }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null
}

$results | Format-Table -AutoSize
