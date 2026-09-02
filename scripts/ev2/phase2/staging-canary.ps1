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

$tokenLines = @(
  Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' |
    ForEach-Object { $_.Line }
)
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
$draftId = $null
$password = "Ev2!$([guid]::NewGuid().ToString('N'))"
$email = "ev2-g2-$([guid]::NewGuid().ToString('N'))@example.invalid"

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )
  $args = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
    TimeoutSec = 25
  }
  if ($null -ne $Body) {
    $args.ContentType = "application/json"
    $args.Body = $Body | ConvertTo-Json -Depth 30 -Compress
  }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) {
    try { $json = $response.Content | ConvertFrom-Json -Depth 40 } catch { $json = $null }
  }
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json }
}

function Assert-Check {
  param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{
      Test = $Name
      Result = $(if ($Condition) { "PASS" } else { "FAIL" })
      Detail = $Detail
    })
  if ($Condition) { Write-Host "PASS $Name — $Detail" }
  else { throw "Falha em $Name ($Detail)" }
}

function New-Envelope {
  param([Nullable[int]]$ExpectedVersion = $null, [string]$Environment = "staging")
  $envelope = @{
    schemaVersion = 1
    commandId = [guid]::NewGuid().ToString()
    correlationId = [guid]::NewGuid().ToString()
    occurredAt = [DateTime]::UtcNow.ToString("o")
    actorContext = @{ environment = $Environment; siteKey = "main" }
  }
  if ($null -ne $ExpectedVersion) { $envelope.expectedVersion = [int]$ExpectedVersion }
  return $envelope
}

function Invoke-DraftCommand {
  param([string]$Token, [object]$Body, [string]$IdempotencyKey = "")
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin }
  if ($IdempotencyKey) { $headers["X-Idempotency-Key"] = $IdempotencyKey }
  foreach ($attempt in 1..2) {
    try {
      return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/cms-drafts-v2" -Headers $headers -Body $Body
    }
    catch {
      if ($attempt -eq 2) { throw }
      Start-Sleep -Seconds 2
    }
  }
}

try {
  $created = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/admin/users" -Headers @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
  } -Body @{
    email = $email
    password = $password
    email_confirm = $true
    user_metadata = @{ synthetic = $true; phase = "ev2-g2" }
  }
  Assert-Check "synthetic_user_created" ($created.Status -eq 200 -and $created.Json.id) "HTTP $($created.Status)"
  $userId = [string]$created.Json.id

  $serviceHeaders = @{
    apikey = $serviceKey
    Authorization = "Bearer $serviceKey"
    Prefer = "return=representation"
  }
  $profile = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_profiles" -Headers $serviceHeaders -Body @{
    user_id = $userId
    display_name = "OP técnico sintético EV2 G2"
    display_email = $email
    status = "active"
  }
  Assert-Check "synthetic_profile_created" ($profile.Status -eq 201) "HTTP $($profile.Status)"
  $role = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_user_roles" -Headers $serviceHeaders -Body @{
    user_id = $userId
    role_key = "editor"
  }
  Assert-Check "editor_role_assigned" ($role.Status -eq 201) "HTTP $($role.Status)"

  $expiresAt = [DateTime]::UtcNow.AddMinutes(30).ToString("o")
  $override = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides" -Headers $serviceHeaders -Body @{
    flag_key = "ev2.draft_v2"
    environment = "staging"
    scope_type = "user"
    scope_key = $userId
    enabled = $true
    reason = "Canary técnico sintético e descartável do Gate G2"
    starts_at = [DateTime]::UtcNow.AddSeconds(-5).ToString("o")
    expires_at = $expiresAt
    created_by = $userId
  }
  Assert-Check "user_flag_enabled" ($override.Status -eq 201 -and @($override.Json).Count -eq 1) "HTTP $($override.Status)"
  $overrideId = [string]@($override.Json)[0].id

  $signIn = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
  } -Body @{ email = $email; password = $password }
  Assert-Check "synthetic_signin" ($signIn.Status -eq 200 -and $signIn.Json.access_token) "HTTP $($signIn.Status)"
  $token = [string]$signIn.Json.access_token

  $capability = Invoke-DraftCommand -Token $token -Body @{
    action = "capability"
    envelope = New-Envelope
  }
  Assert-Check "capability_user_override" ($capability.Status -eq 200 -and $capability.Json.enabled -eq $true) "HTTP $($capability.Status)"

  $createKey = [guid]::NewGuid().ToString()
  $createBody = @{
    action = "create"
    envelope = New-Envelope
    contentType = "product"
    workingTitle = ""
  }
  $draft = Invoke-DraftCommand -Token $token -Body $createBody -IdempotencyKey $createKey
  Assert-Check "empty_draft_created" ($draft.Status -eq 200 -and $draft.Json.lockVersion -eq 1) "HTTP $($draft.Status)"
  $draftId = [string]$draft.Json.draftId

  $replay = Invoke-DraftCommand -Token $token -Body $createBody -IdempotencyKey $createKey
  Assert-Check "create_idempotent_replay" ($replay.Status -eq 200 -and $replay.Json.replayed -eq $true -and $replay.Json.draftId -eq $draftId) "HTTP $($replay.Status)"

  $patch = Invoke-DraftCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "patch"
    envelope = New-Envelope -ExpectedVersion 1
    draftId = $draftId
    workingTitle = "Produto sintético EV2 G2"
    patches = @(@{ operation = "set"; path = @("draft"); value = @{ synthetic = $true; note = "canary" } })
  }
  Assert-Check "autosave_patch" ($patch.Status -eq 200 -and $patch.Json.lockVersion -eq 2) "HTTP $($patch.Status)"

  $conflict = Invoke-DraftCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "patch"
    envelope = New-Envelope -ExpectedVersion 1
    draftId = $draftId
    patches = @(@{ operation = "set"; path = @("stale"); value = $true })
  }
  Assert-Check "stale_conflict_preserves_work" (
    $conflict.Status -eq 409 -and
    $conflict.Json.preserved -eq $true -and
    $conflict.Json.currentVersion -eq 2 -and
    $conflict.Json.diffRef
  ) "HTTP $($conflict.Status)"

  $resumed = Invoke-DraftCommand -Token $token -Body @{
    action = "resume"
    envelope = New-Envelope
    contentType = "product"
  }
  Assert-Check "resume_returns_latest" (
    $resumed.Status -eq 200 -and
    $resumed.Json.draft.draftId -eq $draftId -and
    $resumed.Json.draft.lockVersion -eq 2
  ) "HTTP $($resumed.Status)"

  $publicRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/cms_content_drafts_v2?select=id&limit=1" -Headers @{
    apikey = $anonKey
    Authorization = "Bearer $anonKey"
  }
  Assert-Check "anonymous_shadow_read_denied" ($publicRead.Status -in @(401, 403)) "HTTP $($publicRead.Status)"

  $production = Invoke-DraftCommand -Token $token -Body @{
    action = "capability"
    envelope = New-Envelope -Environment "production"
  }
  Assert-Check "production_rejected" (
    $production.Status -eq 403 -and $production.Json.code -eq "CMS_DRAFT_V2_PRODUCTION_GATED"
  ) "HTTP $($production.Status)"

  $disabled = Invoke-Api -Method Patch -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides?id=eq.$overrideId" -Headers $serviceHeaders -Body @{
    enabled = $false
    reason = "Canary técnico G2 concluído; kill switch por escopo validado"
    expires_at = [DateTime]::UtcNow.AddMinutes(1).ToString("o")
  }
  Assert-Check "scoped_kill_switch_applied" ($disabled.Status -eq 200) "HTTP $($disabled.Status)"
  $capabilityOff = Invoke-DraftCommand -Token $token -Body @{
    action = "capability"
    envelope = New-Envelope
  }
  Assert-Check "scoped_kill_switch_effective" ($capabilityOff.Status -eq 200 -and $capabilityOff.Json.enabled -eq $false) "HTTP $($capabilityOff.Status)"
}
finally {
  if ($userId) {
    [void][guid]::Parse($userId)
    $draftFilter = if ($draftId) { "and draft_id = '$draftId'::uuid" } else { "" }
    $cleanupSql = @"
begin;
delete from public.cms_draft_v2_command_receipts where actor_id = '$userId'::uuid;
alter table public.cms_draft_v2_events disable trigger cms_draft_v2_events_immutable;
delete from public.cms_draft_v2_events where actor_id = '$userId'::uuid $draftFilter;
alter table public.cms_draft_v2_events enable trigger cms_draft_v2_events_immutable;
delete from public.cms_content_drafts_v2 where created_by = '$userId'::uuid;
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id = '$userId'::uuid and action like 'cms:drafts_v2.%';
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
        apikey = $serviceKey
        Authorization = "Bearer $serviceKey"
      }
    }
    catch { Write-Warning "A limpeza sintética exige auditoria manual." }
  }
  $managementToken = $null
  $anonKey = $null
  $serviceKey = $null
  $password = $null
}

$results | Format-Table -AutoSize
