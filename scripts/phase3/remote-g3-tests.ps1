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
if ($project.ref -ne $TargetRef -or $project.name -ne $ExpectedName -or $project.region -ne $ExpectedRegion) { throw "ALVO RECUSADO: staging não corresponde ao ref, nome e região aprovados." }
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if (!$anonKey -or !$serviceKey) { throw "Chaves exclusivas do staging indisponíveis." }

$results = [System.Collections.Generic.List[object]]::new()
$createdUsers = [System.Collections.Generic.List[string]]::new()
$storagePaths = [System.Collections.Generic.List[string]]::new()
$password = "G3!$([guid]::NewGuid().ToString('N'))"

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) { $args.ContentType = "application/json"; $args.Body = $Body | ConvertTo-Json -Depth 30 -Compress }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 40 } catch { $json = $null } }
  [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}
function Assert-Check { param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Condition) { "PASS" } else { "FAIL" }); Detail = $Detail })
  if (!$Condition) { throw "Falha em $Name ($Detail)" }
}
function New-User { param([string]$Label)
  $email = "g3-$Label-$([guid]::NewGuid().ToString('N'))@example.invalid"
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/admin/users" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } @{ email = $email; password = $password; email_confirm = $true; user_metadata = @{ synthetic = $true; phase = 3 } }
  Assert-Check "create_user_$Label" ($response.Status -eq 200) "HTTP $($response.Status)"
  $createdUsers.Add([string]$response.Json.id); [pscustomobject]@{ Id = [string]$response.Json.id; Email = $email }
}
function Sign-In { param([object]$User)
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/token?grant_type=password" @{ apikey = $anonKey } @{ email = $User.Email; password = $password }
  Assert-Check "signin_$($User.Email.Split('-')[1])" ($response.Status -eq 200 -and $response.Json.access_token) "HTTP $($response.Status)"; [string]$response.Json.access_token
}
function User-Headers { param([string]$Token) @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin; Prefer = "return=representation" } }
function Invoke-Function { param([string]$Name, [string]$Token, [object]$Body, [bool]$Idempotent = $false)
  $headers = User-Headers $Token; if ($Idempotent) { $headers["X-Idempotency-Key"] = [guid]::NewGuid().ToString() }
  Invoke-Api Post "$ProjectUrl/functions/v1/$Name" $headers $Body
}
function Content-Payload { param([string]$Title, [string]$Slug)
  @{ schemaVersion = 1; consumerId = "cms.synthetic-article.v1"; contentType = "post"; title = $Title;
    summary = "Resumo sintético descartável para o Gate G3."; excerpt = "Resumo sintético descartável para o Gate G3."; authorName = "Equipe sintética";
    blocks = @(@{ id = [guid]::NewGuid().ToString(); type = "rich_text"; data = @{ text = "Texto totalmente fictício sem informação comercial real." } });
    seo = @{ title = $Title; description = "Descrição sintética e não indexável para validação do Gate G3."; canonicalPath = "/cms/conteudo/$Slug"; indexable = $false };
    provenance = @(@{ sourceKind = "owner_authored"; rightsConfirmed = $true; commercialOwner = "Owner sintético"; technicalOwner = "Owner sintético"; verifiedAt = [DateTime]::UtcNow.ToString("o") }) }
}

try {
  $editor = New-User "editor"; $reviewer = New-User "reviewer"; $publisher = New-User "publisher"; $noAccess = New-User "noaccess"
  $serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=minimal" }
  $profiles = @(
    @{ user_id = $editor.Id; display_name = "Editor sintético"; display_email = $editor.Email; status = "active" },
    @{ user_id = $reviewer.Id; display_name = "Revisor sintético"; display_email = $reviewer.Email; status = "active" },
    @{ user_id = $publisher.Id; display_name = "Publicador sintético"; display_email = $publisher.Email; status = "active" }
  )
  $roles = @(@{ user_id = $editor.Id; role_key = "editor" }, @{ user_id = $reviewer.Id; role_key = "reviewer" }, @{ user_id = $publisher.Id; role_key = "marketing" })
  Assert-Check "insert_profiles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_profiles" $serviceHeaders $profiles).Status -eq 201) "perfis sintéticos"
  Assert-Check "assign_roles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_user_roles" $serviceHeaders $roles).Status -eq 201) "papéis separados"
  $editorToken = Sign-In $editor; $reviewerToken = Sign-In $reviewer; $publisherToken = Sign-In $publisher; $noAccessToken = Sign-In $noAccess
  foreach ($entry in @(@($editorToken, "editor"), @($reviewerToken, "reviewer"), @($publisherToken, "publisher"))) {
    $resolved = Invoke-Function "cms-session" $entry[0] @{ action = "resolve" }; Assert-Check "session_$($entry[1])" ($resolved.Status -eq 200 -and $resolved.Json.accessGranted) "HTTP $($resolved.Status)"
  }
  $deniedSession = Invoke-Function "cms-session" $noAccessToken @{ action = "resolve" }
  Assert-Check "ui_session_no_permission" ($deniedSession.Status -eq 403) "identidade sem perfil não entra no shell"

  $slug = "g3-sintetico-$([guid]::NewGuid().ToString('N').Substring(0,12))"; $payloadV1 = Content-Payload "Demonstração sintética versão um" $slug
  $created = Invoke-Function "cms-content" $editorToken @{ action = "create"; contentType = "post"; slug = $slug; payload = $payloadV1 } $true
  Assert-Check "content_create" ($created.Status -eq 200 -and $created.Json.status -eq "draft") "HTTP $($created.Status)"
  $itemId = [string]$created.Json.itemId
  $apiDenied = Invoke-Function "cms-content" $noAccessToken @{ action = "create"; contentType = "post"; slug = "negado-$slug"; payload = $payloadV1 } $true
  Assert-Check "api_no_permission" ($apiDenied.Status -eq 403) "HTTP $($apiDenied.Status)"
  $dbDeniedRead = Invoke-Api Get "$ProjectUrl/rest/v1/cms_content_items?select=id" (User-Headers $noAccessToken)
  Assert-Check "database_no_permission_read" ($dbDeniedRead.Status -eq 200 -and @($dbDeniedRead.Json).Count -eq 0) "RLS retorna zero"
  $dbDeniedWrite = Invoke-Api Post "$ProjectUrl/rest/v1/cms_content_items" (User-Headers $noAccessToken) @{ content_type = "post"; slug = "forja-$slug"; created_by = $noAccess.Id; updated_by = $noAccess.Id }
  Assert-Check "database_no_permission_write" ($dbDeniedWrite.Status -in @(401,403)) "HTTP $($dbDeniedWrite.Status)"
  $conflict = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemId; slug = $slug; payload = $payloadV1; expectedLockVersion = 99 } $true
  $conflictProperty = $conflict.Json.PSObject.Properties["code"]
  $conflictCode = if ($null -ne $conflictProperty) { $conflictProperty.Value } else { "ausente" }
  Assert-Check "optimistic_conflict" ($conflict.Status -eq 409) "HTTP $($conflict.Status) código $conflictCode"
  $saved = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemId; slug = $slug; payload = $payloadV1; expectedLockVersion = 1 } $true
  Assert-Check "draft_save" ($saved.Status -eq 200 -and $saved.Json.lockVersion -eq 2) "lock 2"
  $submitted = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemId; expectedLockVersion = 2; reason = "Revisão sintética inicial" } $true
  Assert-Check "submit_review" ($submitted.Status -eq 200 -and $submitted.Json.status -eq "in_review") "revisão congelada"
  $revisionV1 = [string]$submitted.Json.revisionId
  $approved = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemId; revisionId = $revisionV1; reason = "Aprovação sintética por papel revisor" } $true
  Assert-Check "review_approve" ($approved.Status -eq 200 -and $approved.Json.status -eq "approved") "aprovado"
  $previewIssued = Invoke-Function "cms-preview" $editorToken @{ itemId = $itemId; revisionId = $revisionV1; maxUses = 10; minutes = 15 }
  Assert-Check "preview_issue" ($previewIssued.Status -eq 201 -and $previewIssued.Json.token) "token curto"
  $preview = Invoke-Api Get "$ProjectUrl/functions/v1/cms-preview?token=$($previewIssued.Json.token)" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "preview_real" ($preview.Status -eq 200 -and $preview.Json.payload.title -eq $payloadV1.title -and $preview.Response.Headers["Cache-Control"] -match "no-store") "renderer payload/no-store"
  $publishedV1 = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemId; revisionId = $revisionV1; reason = "Publicação sintética" } $true
  Assert-Check "publish_transaction" ($publishedV1.Status -eq 200 -and $publishedV1.Json.contentVersion -eq 1 -and $publishedV1.Json.etag) "projeção v1"
  $publicV1 = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?slug=$slug" @{ apikey = $anonKey }
  Assert-Check "public_projection" ($publicV1.Status -eq 200 -and $publicV1.Json.payload.title -eq $payloadV1.title -and $publicV1.Json.content_version -eq 1) "conteúdo exibido"

  $workerSecret = "g3-" + [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  $env:SUPABASE_ACCESS_TOKEN = $managementToken
  try { $secretOutput = npx supabase secrets set "OUTBOX_WORKER_SECRET=$workerSecret" --project-ref $TargetRef 2>&1; if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar secret exclusivo do worker." } } finally { Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
  $workerFail = Invoke-Api Post "$ProjectUrl/functions/v1/cms-outbox-worker" @{ apikey = $anonKey; "X-Worker-Secret" = $workerSecret; "X-Simulate-Failure" = "true" }
  Assert-Check "outbox_failure_alert" ($workerFail.Status -eq 200 -and $workerFail.Json.failed -ge 1) "falha simulada observada"
  $publicAfterFailure = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?slug=$slug" @{ apikey = $anonKey }
  Assert-Check "last_projection_survives" ($publicAfterFailure.Status -eq 200 -and $publicAfterFailure.Json.etag -eq $publicV1.Json.etag) "última projeção válida preservada"
  $null = Invoke-Api Patch "$ProjectUrl/rest/v1/cms_publication_outbox?item_id=eq.$itemId&status=eq.failed" $serviceHeaders @{ available_at = [DateTime]::UtcNow.ToString("o") }
  $workerOk = Invoke-Api Post "$ProjectUrl/functions/v1/cms-outbox-worker" @{ apikey = $anonKey; "X-Worker-Secret" = $workerSecret }
  Assert-Check "outbox_retry" ($workerOk.Status -eq 200 -and $workerOk.Json.completed -ge 1) "retry idempotente"

  $payloadV2 = Content-Payload "Demonstração sintética versão dois" $slug
  $savedV2 = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemId; slug = $slug; payload = $payloadV2; expectedLockVersion = 2 } $true
  Assert-Check "published_opens_new_draft" ($savedV2.Status -eq 200 -and $savedV2.Json.lockVersion -eq 3) "projeção não sobrescrita"
  $submittedV2 = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemId; expectedLockVersion = 3; reason = "Segunda revisão sintética" } $true
  $revisionV2 = [string]$submittedV2.Json.revisionId
  $null = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemId; revisionId = $revisionV2; reason = "Segunda aprovação sintética" } $true
  $publishedV2 = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemId; revisionId = $revisionV2; reason = "Segunda publicação sintética" } $true
  Assert-Check "cache_version_increment" ($publishedV2.Json.contentVersion -eq 2 -and $publishedV2.Json.etag -ne $publishedV1.Json.etag) "ETag/cache v2"
  $restored = Invoke-Function "cms-content" $publisherToken @{ action = "restore"; itemId = $itemId; revisionId = $revisionV1; reason = "Restauração sintética da versão um" } $true
  $publicRestored = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?slug=$slug" @{ apikey = $anonKey }
  Assert-Check "restore_as_new_revision" ($restored.Status -eq 200 -and $restored.Json.contentVersion -eq 3 -and $publicRestored.Json.payload.title -eq $payloadV1.title) "restaurado/publicado v3"

  $imageData = node -e "const sharp=require('sharp');(async()=>{const base=sharp({create:{width:64,height:48,channels:4,background:{r:0,g:87,b:222,alpha:1}}});const o={original:(await base.png().toBuffer()).toString('base64')};for(const k of [['thumbnail',160],['medium',800],['large',1600]])for(const f of ['webp','avif'])o[k[0]+'.'+f]=(await base.clone().resize(k[1],Math.round(k[1]*.75)).toFormat(f).toBuffer()).toString('base64');console.log(JSON.stringify(o))})()" | ConvertFrom-Json
  $mediaCreate = Invoke-Function "cms-media" $publisherToken @{ action = "create"; metadata = @{ originalFilename = "g3-sintetico.png"; declaredMime = "image/png"; sourceKind = "synthetic_test"; sourceReference = "Gerado por fixture G3"; rightsConfirmed = $true; licenseName = "Uso de teste descartável"; ownerName = "Fixture G3"; altText = "Retângulo azul sintético"; focalX = 0.5; focalY = 0.5 } }
  Assert-Check "media_reserve_private" ($mediaCreate.Status -eq 201 -and @($mediaCreate.Json.uploads).Count -eq 7) "sete uploads privados"
  $assetId = [string]$mediaCreate.Json.assetId
  foreach ($upload in $mediaCreate.Json.uploads) { $key = if ($upload.key -eq "original") { "original" } else { "$($upload.key).$($upload.format)" }; $bytes = [Convert]::FromBase64String([string]$imageData.PSObject.Properties[$key].Value); $contentType = if ($upload.key -eq "original") { "image/png" } else { "image/$($upload.format)" }; $uploadResponse = Invoke-WebRequest -Method Put -Uri $upload.signedUrl -ContentType $contentType -Body $bytes -SkipHttpErrorCheck; Assert-Check "upload_$key" ([int]$uploadResponse.StatusCode -in @(200,201)) "HTTP $($uploadResponse.StatusCode)"; $storagePaths.Add([string]$upload.path) }
  $mediaFinal = Invoke-Function "cms-media" $publisherToken @{ action = "finalize"; assetId = $assetId }
  Assert-Check "media_process_variants" ($mediaFinal.Status -eq 200 -and $mediaFinal.Json.status -eq "ready" -and $mediaFinal.Json.variants -eq 6) "MIME/dimensões/scan/WebP/AVIF"
  $null = Invoke-Api Post "$ProjectUrl/rest/v1/cms_media_usages" $serviceHeaders @{ asset_id = $assetId; item_id = $itemId; revision_id = $restored.Json.revisionId; usage_kind = "content" }
  $mediaDeleteDenied = Invoke-Function "cms-media" $publisherToken @{ action = "delete"; assetId = $assetId }
  Assert-Check "media_usage_guard" ($mediaDeleteDenied.Status -eq 409) "ativo em uso não pode ser removido"

  $audit = Invoke-Api Get "$ProjectUrl/rest/v1/cms_audit_log?target_id=eq.$itemId&select=id,action" $serviceHeaders
  Assert-Check "audit_complete" ($audit.Status -eq 200 -and @($audit.Json).Count -ge 8) "criar/salvar/revisar/aprovar/publicar/restaurar"
  $alerts = Invoke-Api Get "$ProjectUrl/rest/v1/cms_operational_events?item_id=eq.$itemId&select=id,event_type,error_code" $serviceHeaders
  Assert-Check "failure_metric_persisted" ($alerts.Status -eq 200 -and @($alerts.Json).Count -ge 1) "alerta sem remover projeção"
}
finally {
  foreach ($path in $storagePaths) { $null = Invoke-WebRequest -Method Delete -Uri "$ProjectUrl/storage/v1/object/cms-media-private/$path" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } -SkipHttpErrorCheck }
  if ($createdUsers.Count -gt 0) {
    $ids = ($createdUsers | ForEach-Object { "'$($_ -replace "'", "''")'::uuid" }) -join ","
    $cleanupSql = @"
begin;
delete from public.cms_media_usages where item_id in (select id from public.cms_content_items where created_by in ($ids));
delete from public.cms_media_variants where asset_id in (select id from public.cms_media_assets where created_by in ($ids));
delete from public.cms_media_assets where created_by in ($ids);
delete from public.cms_operational_events where item_id in (select id from public.cms_content_items where created_by in ($ids));
delete from public.cms_preview_tokens where created_by in ($ids);
delete from public.cms_publication_outbox where item_id in (select id from public.cms_content_items where created_by in ($ids));
delete from public.cms_publications where item_id in (select id from public.cms_content_items where created_by in ($ids));
delete from public.cms_published_projection where item_id in (select id from public.cms_content_items where created_by in ($ids));
alter table public.cms_content_approvals disable trigger cms_approvals_immutable;
delete from public.cms_content_approvals where reviewer_id in ($ids);
alter table public.cms_content_approvals enable trigger cms_approvals_immutable;
delete from public.cms_editorial_command_receipts where actor_id in ($ids);
delete from public.cms_content_taxonomy where assigned_by in ($ids);
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
delete from public.request_rate_limits;
commit;
"@
    $cleanupDone = $false
    foreach ($attempt in 1..4) {
      try {
        $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress)
        $cleanupDone = $true
        break
      }
      catch {
        if ($attempt -eq 4) { Write-Warning "Limpeza transacional exigirá auditoria posterior." }
        else { Start-Sleep -Seconds (2 * $attempt) }
      }
    }
  }
  foreach ($userId in $createdUsers) { $null = Invoke-Api Delete "$ProjectUrl/auth/v1/admin/users/$userId" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null
}

$results | Format-Table -AutoSize
