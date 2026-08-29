param(
  [Parameter(Mandatory = $true)][string]$SecretFile,
  [ValidateSet("prepare", "restore")][string]$Mode = "prepare",
  [string]$BaseRevisionId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ProjectUrl = "https://$TargetRef.supabase.co"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"
$AllowedOrigin = "https://gaiatec-cms-staging.pages.dev"
$ItemId = "b67bb372-36b2-44b4-ba42-7f814ff17260"
$ActorId = "d5eb3016-cb94-4346-abf1-da1cb26f2bdb"
$ActorEmail = "cms-pilot-bootstrap@gaiatecsistemas.com.br"
$RoundTripMarker = "ROUNDTRIP-G4-SEM-REBUILD"

$tokenLines = @(Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' | ForEach-Object { $_.Line })
if ($tokenLines.Count -ne 1) { throw "Esperada exatamente uma linha SUPABASE_ACCESS_TOKEN." }
$managementToken = (($tokenLines[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
$managementHeaders = @{ Authorization = "Bearer $managementToken"; "Content-Type" = "application/json" }
$project = Invoke-RestMethod -Method Get -Uri $ManagementUrl -Headers $managementHeaders
if ($project.ref -ne $TargetRef -or $project.name -ne "GAIATEC CMS Staging" -or $project.region -ne "us-east-2") {
  throw "ALVO RECUSADO: staging não corresponde ao ref, nome e região aprovados."
}
$keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if (!$anonKey -or !$serviceKey) { throw "Chaves exclusivas do staging indisponíveis." }

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $args.ContentType = "application/json"
    $args.Body = $Body | ConvertTo-Json -Depth 80 -Compress
  }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 100 } catch { $json = $null } }
  [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}
function Assert-Status {
  param([string]$Name, [object]$Response, [int[]]$Allowed = @(200))
  if ($Response.Status -notin $Allowed) { throw "$Name falhou: HTTP $($Response.Status) $($Response.Response.Content)" }
  Write-Output "PASS $Name HTTP $($Response.Status)"
}
function Invoke-Function {
  param([string]$Name, [string]$Token, [object]$Body)
  Invoke-Api Post "$ProjectUrl/functions/v1/$Name" @{
    apikey = $anonKey
    Authorization = "Bearer $Token"
    Origin = $AllowedOrigin
    "X-Idempotency-Key" = [guid]::NewGuid().ToString()
  } $Body
}
function Invoke-Query {
  param([string]$Sql, [bool]$ReadOnly = $true)
  Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{
    query = $Sql
    read_only = $ReadOnly
  } | ConvertTo-Json -Compress)
}
function Get-EditorialState {
  $sql = @"
select item.id::text, item.slug, item.workflow_status, draft.lock_version, draft.payload
from public.cms_content_items item
join public.cms_content_drafts draft on draft.item_id = item.id
where item.id = '$ItemId'::uuid and item.content_type = 'product';
"@
  @(Invoke-Query $sql)[0]
}

$password = "F4!$([guid]::NewGuid().ToString('N'))"
$serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=representation" }
$authHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
$actorToken = $null
try {
  Assert-Status "actor_temporarily_active" (Invoke-Api Patch "$ProjectUrl/rest/v1/cms_profiles?user_id=eq.$ActorId" $serviceHeaders @{
    status = "active"; suspended_at = $null; suspended_by = $null
  })
  Assert-Status "actor_temporarily_unbanned" (Invoke-Api Put "$ProjectUrl/auth/v1/admin/users/$ActorId" $authHeaders @{
    password = $password; ban_duration = "none"
  })
  $login = Invoke-Api Post "$ProjectUrl/auth/v1/token?grant_type=password" @{ apikey = $anonKey } @{
    email = $ActorEmail; password = $password
  }
  Assert-Status "actor_signin" $login
  $actorToken = [string]$login.Json.access_token

  if ($Mode -eq "prepare") {
    $state = Get-EditorialState
    $payload = $state.payload
    $now = [DateTime]::UtcNow.ToString("o")
    if ($payload.PSObject.Properties.Name -contains "brand") { $payload.brand = @{ name = "GATFLOW"; slug = "gatflow" } }
    else { $payload | Add-Member -NotePropertyName brand -NotePropertyValue @{ name = "GATFLOW"; slug = "gatflow" } }
    if ($payload.models[0].PSObject.Properties.Name -contains "manufacturerReference") { $payload.models[0].manufacturerReference = "KF700E" }
    else { $payload.models[0] | Add-Member -NotePropertyName manufacturerReference -NotePropertyValue "KF700E" }
    $payload.models[0].model = "GATFLOW-B"
    $payload.pilotState = "homologated"
    $payload.summary = "Piloto funcional homologado e integralmente editável no CMS. GATFLOW é a marca comercial, GATFLOW-B é o modelo comercial e KF700E é a referência do fabricante; fabricante/OEM nominal e especificações definitivas permanecem a confirmar."
    $payload.commercial.valueProposition = "O PDF técnico da referência KF700E sustenta operação sem alimentação externa e aplicação em pontos remotos. O conteúdo permanece editável para homologação técnica definitiva."
    $rich = @($payload.blocks | Where-Object { $_.type -eq "rich_text" })[0]
    $rich.data.text = "Piloto funcional homologado. GATFLOW é a marca comercial própria, GATFLOW-B é o modelo comercial GAIATEC e KF700E é a referência/modelo do fabricante. O fabricante/OEM nominal e as especificações definitivas permanecem editáveis e a confirmar. Versão homologada pelo solicitante."
    $payload.approval = @{
      portfolioOwner = "Administrador/solicitante GAIATEC — homologação funcional do piloto"
      technicalReviewer = "Especificações permanecem editáveis e sujeitas a validação definitiva"
      commercialReviewer = "GATFLOW/GATFLOW-B/KF700E confirmados em 2026-08-29"
      editorialReviewer = "Clean-room, proveniência e round-trip conferidos"
      homologatedAt = $now
    }
    $save = Invoke-Function "cms-content" $actorToken @{
      action = "save"; itemId = $ItemId; slug = $state.slug; payload = $payload
      expectedLockVersion = [int]$state.lock_version; reason = "Homologação funcional G4 e identidade comercial/fabricante separada"
    }
    Assert-Status "homologated_draft_saved" $save
    $afterSave = Get-EditorialState
    $submit = Invoke-Function "cms-content" $actorToken @{
      action = "submit"; itemId = $ItemId; expectedLockVersion = [int]$afterSave.lock_version
      reason = "Revisão integral campo-consumidor do piloto homologado"
    }
    Assert-Status "homologated_revision_submitted" $submit
    $baseRevision = [string]$submit.Json.revisionId
    Assert-Status "homologated_revision_approved" (Invoke-Function "cms-content" $actorToken @{
      action = "approve"; itemId = $ItemId; revisionId = $baseRevision
      reason = "Solicitante homologou objetivo funcional e identidade GATFLOW/GATFLOW-B/KF700E"
    })
    $preview = Invoke-Function "cms-preview" $actorToken @{ itemId = $ItemId; revisionId = $baseRevision; maxUses = 20; minutes = 30 }
    Assert-Status "homologated_preview_issued" $preview @(201)
    $previewRead = Invoke-Api Get "$ProjectUrl/functions/v1/cms-preview?token=$($preview.Json.token)" @{ apikey = $anonKey; Origin = $AllowedOrigin }
    Assert-Status "homologated_preview_read" $previewRead
    if ($previewRead.Json.payload.brand.name -ne "GATFLOW" -or
        $previewRead.Json.payload.models[0].model -ne "GATFLOW-B" -or
        $previewRead.Json.payload.models[0].manufacturerReference -ne "KF700E" -or
        $previewRead.Json.payload.pilotState -ne "homologated") { throw "Preview não refletiu identidade/homologação." }
    Assert-Status "homologated_revision_published" (Invoke-Function "cms-content" $actorToken @{
      action = "publish"; itemId = $ItemId; revisionId = $baseRevision; reason = "Publicação do piloto funcional homologado"
    })

    $deltaState = Get-EditorialState
    $delta = $deltaState.payload
    $delta.summary = "$($delta.summary) $RoundTripMarker"
    $delta.search.keywords = @($delta.search.keywords) + @($RoundTripMarker)
    Assert-Status "roundtrip_delta_saved" (Invoke-Function "cms-content" $actorToken @{
      action = "save"; itemId = $ItemId; slug = $deltaState.slug; payload = $delta
      expectedLockVersion = [int]$deltaState.lock_version; reason = "Alteração remota como o editor para prova sem rebuild"
    })
    $deltaSaved = Get-EditorialState
    $deltaSubmit = Invoke-Function "cms-content" $actorToken @{
      action = "submit"; itemId = $ItemId; expectedLockVersion = [int]$deltaSaved.lock_version
      reason = "Round-trip remoto campo para preview e frontend"
    }
    Assert-Status "roundtrip_delta_submitted" $deltaSubmit
    $deltaRevision = [string]$deltaSubmit.Json.revisionId
    Assert-Status "roundtrip_delta_approved" (Invoke-Function "cms-content" $actorToken @{
      action = "approve"; itemId = $ItemId; revisionId = $deltaRevision; reason = "Aprovação temporária do marcador de round-trip"
    })
    Assert-Status "roundtrip_delta_published" (Invoke-Function "cms-content" $actorToken @{
      action = "publish"; itemId = $ItemId; revisionId = $deltaRevision; reason = "Publicação temporária para comprovar atualização sem rebuild"
    })
    $detail = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=detail&slug=$($state.slug)" @{ apikey = $anonKey }
    $search = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=ROUNDTRIP-G4-SEM-REBUILD" @{ apikey = $anonKey }
    if ($detail.Json.payload.summary -notmatch $RoundTripMarker -or $search.Json.total -ne 1) { throw "API pública não refletiu alteração sem rebuild." }
    Write-Output "BASE_REVISION_ID=$baseRevision"
    Write-Output "DELTA_REVISION_ID=$deltaRevision"
    Write-Output "ROUNDTRIP_URL=$AllowedOrigin/produtos/$($state.slug)"
    Write-Output "ROUNDTRIP_MARKER=$RoundTripMarker"
  }
  else {
    if ($BaseRevisionId -notmatch '^[0-9a-f-]{36}$') { throw "BaseRevisionId obrigatório para restore." }
    Assert-Status "roundtrip_restored" (Invoke-Function "cms-content" $actorToken @{
      action = "restore"; itemId = $ItemId; revisionId = $BaseRevisionId
      reason = "Restauração da revisão homologada após prova de round-trip sem rebuild"
    })
    $finalState = Get-EditorialState
    $finalPayload = $finalState.payload
    $finalPayload.commercial.shortDescription = "Medidor eletromagnético alimentado por bateria para líquidos condutivos; piloto funcional homologado, com fabricante/OEM nominal e configuração técnica definitiva ainda editáveis e a confirmar."
    foreach ($media in @($finalPayload.media)) {
      $media.caption = "Piloto funcional homologado; configuração técnica definitiva permanece editável e a confirmar."
    }
    $finalPayload.documents[0].title = "KF700E Battery-powered Electromagnetic Flowmeter — referência técnica do fabricante"
    $finalPayload.seo.title = "GATFLOW-B | Piloto funcional homologado"
    $finalPayload.seo.description = "Piloto funcional homologado do medidor eletromagnético a bateria GATFLOW-B, marca GATFLOW e referência do fabricante KF700E."
    $related = @($finalPayload.blocks | Where-Object { $_.type -eq "related_content" })[0]
    if ($related) { $related.data.state = "Nenhuma relação cadastrada para esta versão." }
    foreach ($source in @($finalPayload.provenance)) {
      $source.authorizationReference = "$($source.authorizationReference); homologação funcional do piloto pelo solicitante em 2026-08-29"
      $source.authorizationDate = "2026-08-29"
      $source.rightsScope = "Uso no piloto funcional homologado em staging; produção não autorizada nesta fase"
      if ($source.technicalOwner -eq "A confirmar na homologação") { $source.technicalOwner = "A confirmar na validação técnica definitiva" }
    }
    Assert-Status "final_normalization_saved" (Invoke-Function "cms-content" $actorToken @{
      action = "save"; itemId = $ItemId; slug = $finalState.slug; payload = $finalPayload
      expectedLockVersion = [int]$finalState.lock_version; reason = "Normalização final de textos após homologação funcional"
    })
    $normalizedState = Get-EditorialState
    $normalizedSubmit = Invoke-Function "cms-content" $actorToken @{
      action = "submit"; itemId = $ItemId; expectedLockVersion = [int]$normalizedState.lock_version
      reason = "Revisão final sem marcador temporário"
    }
    Assert-Status "final_normalization_submitted" $normalizedSubmit
    $normalizedRevision = [string]$normalizedSubmit.Json.revisionId
    Assert-Status "final_normalization_approved" (Invoke-Function "cms-content" $actorToken @{
      action = "approve"; itemId = $ItemId; revisionId = $normalizedRevision
      reason = "Textos finais coerentes com a homologação funcional"
    })
    Assert-Status "final_normalization_published" (Invoke-Function "cms-content" $actorToken @{
      action = "publish"; itemId = $ItemId; revisionId = $normalizedRevision
      reason = "Publicação final do piloto homologado"
    })
    $published = @(Invoke-Query "select revision_id::text, payload from public.cms_published_projection where item_id='$ItemId'::uuid")[0]
    if ($published.payload.summary -match $RoundTripMarker -or $published.payload.pilotState -ne "homologated") {
      throw "Restauração final não removeu marcador ou perdeu homologação."
    }
    $preview = Invoke-Function "cms-preview" $actorToken @{ itemId = $ItemId; revisionId = $published.revision_id; maxUses = 50; minutes = 30 }
    Assert-Status "final_preview_issued" $preview @(201)
    $projection = @(Invoke-Query @"
select product.brand_name, product.primary_model, product.primary_manufacturer_reference,
  variant.manufacturer_reference, count(distinct attribute.id)::int attributes,
  bool_and(attribute.required is not null) required_projected,
  count(distinct document.id)::int documents,
  bool_and(document.storage_path is not null or document.official_url is not null) document_location_projected,
  count(distinct usage.asset_id)::int media_usages
from public.cms_product_projection product
join public.cms_product_variant_projection variant on variant.item_id=product.item_id
join public.cms_product_attribute_projection attribute on attribute.item_id=product.item_id
join public.cms_product_document_projection document on document.item_id=product.item_id
join public.cms_media_usages usage on usage.item_id=product.item_id
where product.item_id='$ItemId'::uuid
group by product.brand_name, product.primary_model, product.primary_manufacturer_reference, variant.manufacturer_reference;
"@)[0]
    if ($projection.brand_name -ne "GATFLOW" -or $projection.primary_model -ne "GATFLOW-B" -or
        $projection.primary_manufacturer_reference -ne "KF700E" -or $projection.manufacturer_reference -ne "KF700E" -or
        $projection.attributes -ne 10 -or !$projection.required_projected -or $projection.documents -ne 1 -or
        !$projection.document_location_projected -or $projection.media_usages -ne 2) { throw "Projeções finais incompletas." }
    Write-Output "FINAL_URL=$AllowedOrigin/produtos/$($published.payload.seo.canonicalPath.Split('/')[-1])"
    Write-Output "FINAL_PREVIEW_URL=$AllowedOrigin/preview/$($preview.Json.token)"
    Write-Output "FINAL_PREVIEW_EXPIRES=$($preview.Json.expiresAt)"
    Write-Output "FINAL_REVISION_ID=$($published.revision_id)"
  }
}
finally {
  $now = [DateTime]::UtcNow.ToString("o")
  $null = Invoke-Api Patch "$ProjectUrl/rest/v1/cms_profiles?user_id=eq.$ActorId" $serviceHeaders @{
    status = "suspended"; suspended_at = $now; suspended_by = $ActorId
  }
  $null = Invoke-Api Put "$ProjectUrl/auth/v1/admin/users/$ActorId" $authHeaders @{ ban_duration = "876000h" }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null; $actorToken = $null
}
