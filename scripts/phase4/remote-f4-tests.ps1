param(
  [Parameter(Mandatory = $true)][string]$SecretFile,
  [switch]$KeepFixtures
)

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
if ($project.ref -ne $TargetRef -or $project.name -ne $ExpectedName -or $project.region -ne $ExpectedRegion) {
  throw "ALVO RECUSADO: staging não corresponde ao ref, nome e região aprovados."
}
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if (!$anonKey -or !$serviceKey) { throw "Chaves exclusivas do staging indisponíveis." }

$results = [System.Collections.Generic.List[object]]::new()
$createdUsers = [System.Collections.Generic.List[string]]::new()
$storagePaths = [System.Collections.Generic.List[string]]::new()
$password = "F4!$([guid]::NewGuid().ToString('N'))"

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $args.ContentType = "application/json"
    $args.Body = $Body | ConvertTo-Json -Depth 40 -Compress
  }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 50 } catch { $json = $null } }
  [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}
function Assert-Check {
  param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Condition) { "PASS" } else { "FAIL" }); Detail = $Detail })
  if (!$Condition) { throw "Falha em $Name ($Detail)" }
}
function New-User {
  param([string]$Label)
  $email = "f4-$Label-$([guid]::NewGuid().ToString('N'))@example.invalid"
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/admin/users" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } @{
    email = $email; password = $password; email_confirm = $true; user_metadata = @{ synthetic = $true; phase = 4 }
  }
  Assert-Check "create_user_$Label" ($response.Status -eq 200) "HTTP $($response.Status)"
  $createdUsers.Add([string]$response.Json.id)
  [pscustomobject]@{ Id = [string]$response.Json.id; Email = $email }
}
function Sign-In {
  param([object]$User, [string]$Label)
  $response = Invoke-Api Post "$ProjectUrl/auth/v1/token?grant_type=password" @{ apikey = $anonKey } @{ email = $User.Email; password = $password }
  Assert-Check "signin_$Label" ($response.Status -eq 200 -and $response.Json.access_token) "HTTP $($response.Status)"
  [string]$response.Json.access_token
}
function User-Headers { param([string]$Token) @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin; Prefer = "return=representation" } }
function Invoke-Function {
  param([string]$Name, [string]$Token, [object]$Body, [bool]$Idempotent = $false)
  $headers = User-Headers $Token
  if ($Idempotent) { $headers["X-Idempotency-Key"] = [guid]::NewGuid().ToString() }
  Invoke-Api Post "$ProjectUrl/functions/v1/$Name" $headers $Body
}
function Product-Payload {
  param([string]$Title, [string]$Slug, [string]$Model, [string]$AssetId, [string]$Version)
  @{
    schemaVersion = 1; consumerId = "cms.catalog-product.v1"; contentType = "product"; pilotState = "synthetic_test"
    title = $Title; summary = "Fixture vertical sintética descartável da Fase 4."
    manufacturer = @{ name = "Fabricante Sintético F4"; slug = "fabricante-sintetico-f4" }
    productLine = @{ name = "Linha Sintética F4"; slug = "linha-sintetica-f4" }
    classification = @{ segment = "Segmento sintético"; category = "Categoria sintética"; subcategory = "Subcategoria sintética"; family = "Família sintética" }
    commercial = @{ shortDescription = "Produto fictício para teste isolado do staging."; valueProposition = "Valida o contrato vertical sem representar item comercial."; benefits = @("Verificação descartável"); differentiators = @("Sem origem no acervo anterior") }
    function = "Medição sintética"; technology = "Tecnologia sintética"
    models = @(@{ id = [guid]::NewGuid().ToString(); model = $Model; sku = "SKU-$Model"; status = "active"; variants = @(@{ id = [guid]::NewGuid().ToString(); name = "Variante $Version"; code = "VAR-$Version"; order = 0 }) })
    specifications = @(
      @{ id = [guid]::NewGuid().ToString(); key = "faixa-medicao"; label = "Faixa de medição"; type = "range"; value = @{ min = 0; max = 100 }; unit = "%"; required = $true; filterable = $true; comparable = $true; searchable = $true },
      @{ id = [guid]::NewGuid().ToString(); key = "protocolo"; label = "Protocolo"; type = "enum"; value = @("SYNTH-A", "SYNTH-B"); required = $true; filterable = $true; comparable = $true; searchable = $true }
    )
    media = @(@{ assetId = $AssetId; role = "primary"; alt = "Retângulo azul sintético da Fase 4"; caption = "Imagem gerada apenas para teste"; order = 0 })
    documents = @(@{ id = [guid]::NewGuid().ToString(); kind = "datasheet"; title = "Ficha sintética descartável"; officialUrl = "https://example.invalid/f4-synthetic-datasheet.pdf"; sha256 = ("a" * 64); revision = $Version; language = "pt-BR"; visibility = "public"; rightsConfirmed = $true })
    relations = @{ productIds = @(); applicationIds = @(); sectorIds = @(); serviceIds = @() }
    search = @{ synonyms = @("medidor fictício", "fixture f4"); keywords = @("sintético", $Model) }
    redirects = @(@{ sourcePath = "/catalogo-sintetico/$Slug"; statusCode = "301" })
    blocks = @(
      @{ id = [guid]::NewGuid().ToString(); type = "rich_text"; data = @{ text = "Texto sintético $Version, sem conteúdo editorial real." } },
      @{ id = [guid]::NewGuid().ToString(); type = "specifications"; data = @{ source = "typed-attributes" } },
      @{ id = [guid]::NewGuid().ToString(); type = "image"; data = @{ assetId = $AssetId; alt = "Retângulo azul sintético da Fase 4" } }
    )
    seo = @{ title = "$Title | Teste F4"; description = "Fixture sintética não indexável para validação vertical da Fase 4."; canonicalPath = "/produtos/$Slug"; indexable = $false }
    provenance = @(@{ sourceKind = "owner_authored"; rightsConfirmed = $true; commercialOwner = "Owner sintético de teste"; technicalOwner = "Owner sintético de teste"; verifiedAt = [DateTime]::UtcNow.ToString("o") })
    approval = @{ portfolioOwner = "Não homologado — fixture sintética"; technicalReviewer = "Revisor sintético"; commercialReviewer = "Revisor sintético"; editorialReviewer = "Revisor sintético" }
  }
}

try {
  $editor = New-User "editor"; $reviewer = New-User "reviewer"; $publisher = New-User "publisher"; $noAccess = New-User "noaccess"
  $serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=minimal" }
  $profiles = @(
    @{ user_id = $editor.Id; display_name = "Editor sintético F4"; display_email = $editor.Email; status = "active" },
    @{ user_id = $reviewer.Id; display_name = "Revisor sintético F4"; display_email = $reviewer.Email; status = "active" },
    @{ user_id = $publisher.Id; display_name = "Publicador sintético F4"; display_email = $publisher.Email; status = "active" }
  )
  $roles = @(@{ user_id = $editor.Id; role_key = "editor" }, @{ user_id = $reviewer.Id; role_key = "reviewer" }, @{ user_id = $publisher.Id; role_key = "commercial" })
  Assert-Check "insert_profiles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_profiles" $serviceHeaders $profiles).Status -eq 201) "perfis"
  Assert-Check "assign_separated_roles" ((Invoke-Api Post "$ProjectUrl/rest/v1/cms_user_roles" $serviceHeaders $roles).Status -eq 201) "RBAC"
  $editorToken = Sign-In $editor "editor"; $reviewerToken = Sign-In $reviewer "reviewer"; $publisherToken = Sign-In $publisher "publisher"; $noAccessToken = Sign-In $noAccess "noaccess"

  $denied = Invoke-Function "cms-content" $noAccessToken @{ action = "create"; contentType = "product"; slug = "f4-negado"; payload = @{} } $true
  Assert-Check "no_permission_denied" ($denied.Status -eq 403) "HTTP $($denied.Status)"

  $imageData = node -e "const sharp=require('sharp');(async()=>{const base=sharp({create:{width:64,height:48,channels:4,background:{r:0,g:87,b:222,alpha:1}}});const o={original:(await base.png().toBuffer()).toString('base64')};for(const k of [['thumbnail',160],['medium',800],['large',1600]])for(const f of ['webp','avif'])o[k[0]+'.'+f]=(await base.clone().resize(k[1],Math.round(k[1]*.75)).toFormat(f).toBuffer()).toString('base64');console.log(JSON.stringify(o))})()" | ConvertFrom-Json
  $mediaCreate = Invoke-Function "cms-media" $editorToken @{ action = "create"; metadata = @{ originalFilename = "f4-synthetic.png"; declaredMime = "image/png"; sourceKind = "synthetic_test"; sourceReference = "Fixture descartável gerada por código na Fase 4"; rightsConfirmed = $true; licenseName = "Uso exclusivo de teste"; ownerName = "Fixture F4"; altText = "Retângulo azul sintético da Fase 4"; focalX = 0.5; focalY = 0.5 } }
  Assert-Check "media_reserved" ($mediaCreate.Status -eq 201 -and @($mediaCreate.Json.uploads).Count -eq 7) "uploads privados"
  $assetId = [string]$mediaCreate.Json.assetId
  foreach ($upload in $mediaCreate.Json.uploads) {
    $key = if ($upload.key -eq "original") { "original" } else { "$($upload.key).$($upload.format)" }
    $bytes = [Convert]::FromBase64String([string]$imageData.PSObject.Properties[$key].Value)
    $contentType = if ($upload.key -eq "original") { "image/png" } else { "image/$($upload.format)" }
    $uploaded = Invoke-WebRequest -Method Put -Uri $upload.signedUrl -ContentType $contentType -Body $bytes -SkipHttpErrorCheck
    Assert-Check "upload_$key" ([int]$uploaded.StatusCode -in @(200, 201)) "HTTP $($uploaded.StatusCode)"
    $storagePaths.Add([string]$upload.path)
  }
  $mediaFinal = Invoke-Function "cms-media" $editorToken @{ action = "finalize"; assetId = $assetId }
  Assert-Check "media_ready" ($mediaFinal.Status -eq 200 -and $mediaFinal.Json.status -eq "ready" -and $mediaFinal.Json.variants -eq 6) "WebP/AVIF"

  $slugA = "f4-produto-a-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  $slugB = "f4-produto-b-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  $payloadA1 = Product-Payload "Produto Sintético A" $slugA "F4-A" $assetId "v1"
  $payloadB1 = Product-Payload "Produto Sintético B" $slugB "F4-B" $assetId "v1"

  $createdA = Invoke-Function "cms-content" $editorToken @{ action = "create"; contentType = "product"; slug = $slugA; payload = $payloadA1 } $true
  $createdB = Invoke-Function "cms-content" $editorToken @{ action = "create"; contentType = "product"; slug = $slugB; payload = $payloadB1 } $true
  Assert-Check "create_two_products" ($createdA.Status -eq 200 -and $createdB.Status -eq 200) "rascunhos"
  $itemA = [string]$createdA.Json.itemId; $itemB = [string]$createdB.Json.itemId
  $conflict = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemA; slug = $slugA; payload = $payloadA1; expectedLockVersion = 99 } $true
  Assert-Check "optimistic_conflict" ($conflict.Status -eq 409) "HTTP $($conflict.Status)"

  $submitA = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemA; expectedLockVersion = 1; reason = "Revisão sintética A" } $true
  $submitB = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemB; expectedLockVersion = 1; reason = "Revisão sintética B" } $true
  $revisionA1 = [string]$submitA.Json.revisionId; $revisionB1 = [string]$submitB.Json.revisionId
  Assert-Check "submit_review" ($submitA.Json.status -eq "in_review" -and $submitB.Json.status -eq "in_review") "revisões imutáveis"
  $approveA = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemA; revisionId = $revisionA1; reason = "Aprovação somente da fixture" } $true
  $approveB = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemB; revisionId = $revisionB1; reason = "Aprovação somente da fixture" } $true
  Assert-Check "reviewer_approves" ($approveA.Json.status -eq "approved" -and $approveB.Json.status -eq "approved") "separação de papéis"

  $previewIssued = Invoke-Function "cms-preview" $editorToken @{ itemId = $itemA; revisionId = $revisionA1; maxUses = 5; minutes = 15 }
  $preview = Invoke-Api Get "$ProjectUrl/functions/v1/cms-preview?token=$($previewIssued.Json.token)" @{ apikey = $anonKey; Origin = $AllowedOrigin }
  Assert-Check "preview_faithful_private" ($preview.Status -eq 200 -and $preview.Json.payload.title -eq $payloadA1.title -and $preview.Response.Headers["Cache-Control"] -match "no-store") "snapshot/no-store"

  $publishedA = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemA; revisionId = $revisionA1; reason = "Publicação sintética A" } $true
  $publishedB = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemB; revisionId = $revisionB1; reason = "Publicação sintética B" } $true
  Assert-Check "publish_two_products" ($publishedA.Json.contentVersion -eq 1 -and $publishedB.Json.contentVersion -eq 1) "projeções"

  $detail = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=detail&slug=$slugA" @{ apikey = $anonKey }
  $list = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=products&segment=Segmento%20sint%C3%A9tico" @{ apikey = $anonKey }
  $search = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=fixture%20f4" @{ apikey = $anonKey }
  $compare = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=products&ids=$slugA,$slugB" @{ apikey = $anonKey }
  $redirect = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=redirect&path=/catalogo-sintetico/$slugA" @{ apikey = $anonKey }
  $sitemap = Invoke-WebRequest -Method Get -Uri "$ProjectUrl/functions/v1/cms-public?type=sitemap" -Headers @{ apikey = $anonKey } -SkipHttpErrorCheck
  Assert-Check "public_detail_media_schema" ($detail.Status -eq 200 -and @($detail.Json.payload.models[0].variants).Count -eq 1 -and @($detail.Json.media_urls.PSObject.Properties).Count -ge 2) "detalhe/mídia"
  Assert-Check "list_filter_facets" ($list.Status -eq 200 -and $list.Json.total -eq 2 -and $list.Json.facets.segment -contains "Segmento sintético") "lista/filtros"
  Assert-Check "search_synonym" ($search.Status -eq 200 -and $search.Json.total -eq 2) "sinônimo"
  Assert-Check "compare_two" ($compare.Status -eq 200 -and $compare.Json.total -eq 2) "comparador"
  Assert-Check "redirect_projection" ($redirect.Status -eq 200 -and $redirect.Json.destination_path -eq "/produtos/$slugA") "301"
  Assert-Check "sitemap_excludes_synthetic" ([int]$sitemap.StatusCode -eq 200 -and $sitemap.Content -notmatch $slugA -and $sitemap.Content -notmatch $slugB) "não indexável"

  $payloadBad = Product-Payload "Produto Sintético A sem homologação" $slugA "F4-A" $assetId "bad"
  $payloadBad.pilotState = "awaiting_owner"; $payloadBad.seo.indexable = $true
  $saveBad = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemA; slug = $slugA; payload = $payloadBad; expectedLockVersion = 1 } $true
  $submitBad = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemA; expectedLockVersion = 2; reason = "Teste de negação do owner" } $true
  $null = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemA; revisionId = $submitBad.Json.revisionId; reason = "Aprovação técnica da fixture" } $true
  $ownerDenied = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemA; revisionId = $submitBad.Json.revisionId; reason = "Deve falhar sem owner" } $true
  Assert-Check "owner_homologation_required" ($saveBad.Status -eq 200 -and $ownerDenied.Status -eq 422) "HTTP $($ownerDenied.Status)"

  $payloadA2 = Product-Payload "Produto Sintético A revisão dois" $slugA "F4-A" $assetId "v2"
  $savedA2 = Invoke-Function "cms-content" $editorToken @{ action = "save"; itemId = $itemA; slug = $slugA; payload = $payloadA2; expectedLockVersion = 2 } $true
  $submittedA2 = Invoke-Function "cms-content" $editorToken @{ action = "submit"; itemId = $itemA; expectedLockVersion = 3; reason = "Segunda revisão sintética válida" } $true
  $null = Invoke-Function "cms-content" $reviewerToken @{ action = "approve"; itemId = $itemA; revisionId = $submittedA2.Json.revisionId; reason = "Segunda aprovação da fixture" } $true
  $publishedA2 = Invoke-Function "cms-content" $publisherToken @{ action = "publish"; itemId = $itemA; revisionId = $submittedA2.Json.revisionId; reason = "Segunda publicação sintética" } $true
  Assert-Check "new_revision_published" ($savedA2.Status -eq 200 -and $publishedA2.Json.contentVersion -eq 2) "versão 2"
  $restored = Invoke-Function "cms-content" $publisherToken @{ action = "restore"; itemId = $itemA; revisionId = $revisionA1; reason = "Restauração sintética da versão um" } $true
  $restoredDetail = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=detail&slug=$slugA" @{ apikey = $anonKey }
  Assert-Check "restore_as_new_revision" ($restored.Status -eq 200 -and $restored.Json.contentVersion -eq 3 -and $restoredDetail.Json.payload.title -eq $payloadA1.title) "rollback funcional"

  $projectionRows = Invoke-Api Get "$ProjectUrl/rest/v1/cms_product_projection?item_id=in.($itemA,$itemB)&select=item_id" $serviceHeaders
  $variantRows = Invoke-Api Get "$ProjectUrl/rest/v1/cms_product_variant_projection?item_id=in.($itemA,$itemB)&select=id" $serviceHeaders
  $attributeRows = Invoke-Api Get "$ProjectUrl/rest/v1/cms_product_attribute_projection?item_id=in.($itemA,$itemB)&select=id" $serviceHeaders
  $documentRows = Invoke-Api Get "$ProjectUrl/rest/v1/cms_product_document_projection?item_id=in.($itemA,$itemB)&select=id" $serviceHeaders
  Assert-Check "zero_orphan_projection" (@($projectionRows.Json).Count -eq 2 -and @($variantRows.Json).Count -eq 2 -and @($attributeRows.Json).Count -eq 4 -and @($documentRows.Json).Count -eq 2) "todas as estruturas derivadas"
}
finally {
  if (!$KeepFixtures) {
    foreach ($path in $storagePaths) { $null = Invoke-WebRequest -Method Delete -Uri "$ProjectUrl/storage/v1/object/cms-media-private/$path" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } -SkipHttpErrorCheck }
  }
  if (!$KeepFixtures -and $createdUsers.Count -gt 0) {
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
    try { $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress) }
    catch { Write-Warning "A limpeza transacional requer auditoria." }
  }
  if (!$KeepFixtures) {
    foreach ($userId in $createdUsers) { $null = Invoke-Api Delete "$ProjectUrl/auth/v1/admin/users/$userId" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } }
  }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null
}

$results | Format-Table -AutoSize
if ($KeepFixtures) {
  Write-Output "TEMP_FIXTURES=$slugA,$slugB"
}
