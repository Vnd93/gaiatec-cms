param([Parameter(Mandatory = $true)][string]$SecretFile)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ExpectedName = "GAIATEC CMS Staging"
$ExpectedRegion = "us-east-2"
$ProjectUrl = "https://$TargetRef.supabase.co"
$AllowedOrigin = "https://gaiatec-cms-staging.pages.dev"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"

$tokenLines = @(Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' | ForEach-Object { $_.Line })
if ($tokenLines.Count -ne 1) { throw "Esperada exatamente uma linha SUPABASE_ACCESS_TOKEN." }
$managementToken = (($tokenLines[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($managementToken)) { throw "SUPABASE_ACCESS_TOKEN vazio." }
$managementHeaders = @{ Authorization = "Bearer $managementToken"; "Content-Type" = "application/json" }
$project = Invoke-RestMethod -Method Get -Uri $ManagementUrl -Headers $managementHeaders
if ($project.ref -ne $TargetRef -or $project.name -ne $ExpectedName -or $project.region -ne $ExpectedRegion) { throw "ALVO RECUSADO: staging divergente." }
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if (!$anonKey -or !$serviceKey) { throw "Chaves exclusivas do staging indisponíveis." }

$results = [System.Collections.Generic.List[object]]::new()
$createdUsers = [System.Collections.Generic.List[string]]::new()
$createdItems = [System.Collections.Generic.List[string]]::new()
$password = "F5!$([guid]::NewGuid().ToString('N'))"
$fixturePrefix = "f5-sintetico-$([guid]::NewGuid().ToString('N').Substring(0, 10))"

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) { $args.ContentType = "application/json"; $args.Body = $Body | ConvertTo-Json -Depth 40 -Compress }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 50 } catch { $json = $null } }
  [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}
function Assert-Check { param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Condition) { "PASS" } else { "FAIL" }); Detail = $Detail })
  if (!$Condition) { throw "Falha em $Name ($Detail)" }
}
function New-User { param([string]$Label)
  $email = "f5-$Label-$([guid]::NewGuid().ToString('N'))@example.invalid"
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/admin/users" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } @{ email = $email; password = $password; email_confirm = $true; user_metadata = @{ synthetic = $true; phase = 5 } }
  Assert-Check "create_user_$Label" ($response.Status -eq 200) "HTTP $($response.Status)"
  $createdUsers.Add([string]$response.Json.id)
  [pscustomobject]@{ Id = [string]$response.Json.id; Email = $email }
}
function Sign-In { param([object]$User)
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/token?grant_type=password" @{ apikey = $anonKey } @{ email = $User.Email; password = $password }
  Assert-Check "signin_$($User.Email.Split('-')[1])" ($response.Status -eq 200 -and $response.Json.access_token) "HTTP $($response.Status)"
  [string]$response.Json.access_token
}
function Invoke-Function { param([string]$Name, [string]$Token, [object]$Body)
  Invoke-Api Post "$ProjectUrl/functions/v1/$Name" @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin; "X-Idempotency-Key" = [guid]::NewGuid().ToString() } $Body
}
function New-Payload { param([string]$Kind, [string]$Slug, [string]$Version)
  $common = @{
    schemaVersion = 1; consumerId = "cms.$Kind.v1"; contentType = $Kind
    title = "Fixture sintética $Kind $Version"; summary = "Conteúdo técnico descartável da Fase 5, sem uso editorial."
    blocks = @(@{ id = [guid]::NewGuid().ToString(); type = "rich_text"; data = @{ text = "Fixture sintética $Version para validar o round-trip." } })
    seo = @{ title = "Fixture sintética $Kind"; description = "Validação descartável e não indexável da Fase 5."; canonicalPath = "/$Kind/$Slug"; indexable = $false }
    provenance = @(@{ sourceKind = "owner_authored"; authorizationReference = "F5-FIXTURE-SINTETICA"; authorizationDate = [DateTime]::UtcNow.ToString("yyyy-MM-dd"); rightsScope = "Teste descartável de staging"; rightsConfirmed = $true; commercialOwner = "Owner sintético"; technicalOwner = "Owner sintético"; verifiedAt = [DateTime]::UtcNow.ToString("o") })
    governanceState = "synthetic_test"; search = @{ synonyms = @("alias-$Kind"); keywords = @("fixture-f5") }
    media = @(); relations = @{ productIds = @(); serviceIds = @(); industryIds = @(); applicationIds = @(); solutionIds = @() }
    cta = @{ label = "Falar com especialista"; href = "/contato" }
    approval = @{ businessOwner = "Owner sintético"; technicalReviewer = "Revisor sintético"; commercialReviewer = "Revisor sintético"; editorialReviewer = "Revisor sintético" }
  }
  if ($Kind -eq "service") { $common.consumerId = "cms.service.v1"; $common.serviceKind = "Serviço sintético"; $common.scope = "Escopo sintético $Version"; $common.whenToHire = @("Cenário sintético"); $common.deliverables = @("Entregável sintético"); $common.prerequisites = @(); $common.executionSteps = @("Etapa sintética"); $common.approval = @{ operationalOwner = "Owner sintético"; technicalReviewer = "Revisor sintético"; commercialReviewer = "Revisor sintético"; editorialReviewer = "Revisor sintético" }; $common.relations.Remove("serviceIds") }
  if ($Kind -eq "industry") { $common.consumerId = "cms.industry.v1"; $common.marketName = "Mercado sintético"; $common.challenges = @("Desafio sintético"); $common.evidence = @("Evidência sintética"); $common.processAreas = @("Processo sintético") }
  if ($Kind -eq "application") { $common.consumerId = "cms.application.v1"; $common.process = "Processo sintético"; $common.problem = "Problema sintético"; $common.benefits = @("Benefício sintético"); $common.points = @(@{ id = [guid]::NewGuid().ToString(); title = "Ponto sintético"; need = "Necessidade sintética"; variable = "Variável sintética"; function = "Função sintética"; technicalBenefit = "Benefício técnico"; operationalBenefit = "Benefício operacional"; productIds = @(); serviceIds = @() }) }
  if ($Kind -eq "solution") { $common.consumerId = "cms.solution.v1"; $common.problem = "Problema sintético"; $common.approach = "Abordagem sintética"; $common.benefits = @("Benefício sintético"); $common.components = @("Componente sintético"); $common.gasDetectionModel = "integrated_master_catalog" }
  $common
}

try {
  $editor = New-User "editor"; $reviewer = New-User "reviewer"; $publisher = New-User "publisher"; $noAccess = New-User "noaccess"
  $serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=minimal" }
  $profiles = @(
    @{ user_id = $editor.Id; display_name = "Editor F5"; display_email = $editor.Email; status = "active" },
    @{ user_id = $reviewer.Id; display_name = "Revisor F5"; display_email = $reviewer.Email; status = "active" },
    @{ user_id = $publisher.Id; display_name = "Publicador F5"; display_email = $publisher.Email; status = "active" }
  )
  $roles = @(@{ user_id = $editor.Id; role_key = "editor" }, @{ user_id = $reviewer.Id; role_key = "reviewer" }, @{ user_id = $publisher.Id; role_key = "admin" })
  Assert-Check "insert_profiles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_profiles" $serviceHeaders $profiles).Status -eq 201) "perfis"
  Assert-Check "assign_roles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_user_roles" $serviceHeaders $roles).Status -eq 201) "RBAC"
  $editorToken = Sign-In $editor; $reviewerToken = Sign-In $reviewer; $publisherToken = Sign-In $publisher; $noAccessToken = Sign-In $noAccess

  foreach ($kind in @("service", "industry", "application", "solution")) {
    $slug = "$fixturePrefix-$kind"; $payloadV1 = New-Payload $kind $slug "v1"
    $created = Invoke-Function "cms-content" $editorToken @{ action = "create"; contentType = $kind; slug = $slug; payload = $payloadV1 }
    Assert-Check "$kind-create" ($created.Status -eq 200 -and $created.Json.status -eq "draft") "HTTP $($created.Status)"
    $itemId = [string]$created.Json.itemId; $createdItems.Add($itemId)
    $payloadV2 = New-Payload $kind $slug "v2"
    $saved = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemId; slug = $slug; payload = $payloadV2; expectedLockVersion = 1 }
    Assert-Check "$kind-save-roundtrip" ($saved.Status -eq 200 -and $saved.Json.lockVersion -eq 2) "lock $($saved.Json.lockVersion)"
    $submitted = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemId; expectedLockVersion = 2; reason = "Revisão sintética F5" }
    Assert-Check "$kind-submit" ($submitted.Status -eq 200 -and $submitted.Json.status -eq "in_review") "HTTP $($submitted.Status)"
    $revisionId = [string]$submitted.Json.revisionId
    $approved = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemId; revisionId = $revisionId; reason = "Aprovação sintética F5" }
    Assert-Check "$kind-approve" ($approved.Status -eq 200 -and $approved.Json.status -eq "approved") "HTTP $($approved.Status)"
    $previewIssued = Invoke-Function "cms-preview" $editorToken @{ itemId = $itemId; revisionId = $revisionId; maxUses = 3; minutes = 10 }
    Assert-Check "$kind-preview-issue" ($previewIssued.Status -eq 201 -and $previewIssued.Json.token) "HTTP $($previewIssued.Status)"
    $preview = Invoke-Api Get "$ProjectUrl/functions/v1/cms-preview?token=$($previewIssued.Json.token)" @{ apikey = $anonKey; Origin = $AllowedOrigin }
    Assert-Check "$kind-preview-roundtrip" ($preview.Status -eq 200 -and $preview.Json.payload.title -eq $payloadV2.title -and $preview.Response.Headers["Cache-Control"] -match "no-store") "payload/no-store"
    $published = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemId; revisionId = $revisionId; reason = "Publicação sintética F5" }
    Assert-Check "$kind-publish" ($published.Status -eq 200 -and $published.Json.contentVersion -eq 1) "HTTP $($published.Status)"
    $public = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=entity-detail&contentType=$kind&slug=$slug" @{ apikey = $anonKey; Origin = $AllowedOrigin }
    Assert-Check "$kind-public-consumer" ($public.Status -eq 200 -and $public.Json.payload.title -eq $payloadV2.title -and $public.Json.payload.governanceState -eq "synthetic_test") "round-trip público"
  }

  $denied = Invoke-Function "cms-content" $noAccessToken @{ action = "create"; contentType = "industry"; slug = "$fixturePrefix-negado"; payload = (New-Payload "industry" "$fixturePrefix-negado" "v1") }
  Assert-Check "rbac-denied" ($denied.Status -eq 403) "HTTP $($denied.Status)"
  $search = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=fixture-f5" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "search-unified-projection" ($search.Status -eq 200 -and $search.Json.total -eq 4) "quatro domínios"
  $autocomplete = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=autocomplete&q=fixture" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "autocomplete" ($autocomplete.Status -eq 200 -and $autocomplete.Json.total -ge 4 -and $autocomplete.Response.Headers["Cache-Control"] -match "no-store") "resultados/no-store"
  $zeroQuery = "$fixturePrefix-sem-resultado"
  $zero = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=$zeroQuery" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "zero-result-response" ($zero.Status -eq 200 -and $zero.Json.total -eq 0) "zero explícito"
  Start-Sleep -Seconds 1
  $event = Invoke-Api Get "$ProjectUrl/rest/v1/cms_search_events?normalized_query=eq.$zeroQuery&select=id,result_count" $serviceHeaders
  Assert-Check "zero-result-analytics" ($event.Status -eq 200 -and @($event.Json).Count -eq 1 -and $event.Json[0].result_count -eq 0) "evento anônimo"
  $gatflow = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=KF700E" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "gatflow-preserved" ($gatflow.Status -eq 200 -and $gatflow.Json.items[0].payload.brand.name -eq "GATFLOW" -and $gatflow.Json.items[0].payload.models[0].model -eq "GATFLOW-B" -and $gatflow.Json.items[0].payload.models[0].manufacturerReference -eq "KF700E") "identidade/versionamento"
}
finally {
  if ($createdUsers.Count -gt 0) {
    $ids = ($createdUsers | ForEach-Object { "'$($_ -replace "'", "''")'::uuid" }) -join ","
    $items = ($createdItems | ForEach-Object { "'$($_ -replace "'", "''")'::uuid" }) -join ","
    $itemPredicate = if ($createdItems.Count -gt 0) { "item_id in ($items)" } else { "false" }
    $cleanupSql = @"
begin;
delete from public.cms_search_events where normalized_query like '$fixturePrefix%';
delete from public.cms_discovery_projection where $itemPredicate;
delete from public.cms_media_usages where $itemPredicate;
delete from public.cms_preview_tokens where created_by in ($ids);
delete from public.cms_publication_outbox where $itemPredicate;
delete from public.cms_publications where $itemPredicate;
delete from public.cms_published_projection where $itemPredicate;
alter table public.cms_content_approvals disable trigger cms_approvals_immutable;
delete from public.cms_content_approvals where reviewer_id in ($ids);
alter table public.cms_content_approvals enable trigger cms_approvals_immutable;
delete from public.cms_editorial_command_receipts where actor_id in ($ids);
alter table public.cms_content_revisions disable trigger cms_revisions_immutable;
delete from public.cms_content_revisions where created_by in ($ids);
alter table public.cms_content_revisions enable trigger cms_revisions_immutable;
delete from public.cms_content_drafts where updated_by in ($ids);
delete from public.cms_content_items where created_by in ($ids);
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id in ($ids);
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id in ($ids);
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id in ($ids);
delete from public.cms_command_receipts where actor_id in ($ids) or target_user_id in ($ids);
delete from public.cms_user_roles where user_id in ($ids);
delete from public.cms_profiles where user_id in ($ids);
commit;
"@
    $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress)
  }
  foreach ($userId in $createdUsers) { $null = Invoke-Api Delete "$ProjectUrl/auth/v1/admin/users/$userId" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null
}

$results | Format-Table -AutoSize
