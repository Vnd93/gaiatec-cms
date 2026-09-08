param([Parameter(Mandatory = $true)][string]$SecretFile)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ProjectUrl = "https://$TargetRef.supabase.co"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"
$AllowedOrigin = "https://gaiatec-cms-staging.pages.dev"
$SourceRoot = "C:\Users\Comercial-GaiatecSis\OneDrive - gaiatecsistemas.com.br\Soluções\1. Instrumentos de Medição\Medição de Vazão\Eletromagnético\Medidor\A Bateria"
$ImageOne = Join-Path $SourceRoot "GATFLOW-B.png"
$ImageTwo = Join-Path $SourceRoot "GATFLOW-B.2.png"
$Pdf = Join-Path $SourceRoot "KF700E Battery-powered Electromagnetic Flowmeter.pdf"
$ExpectedHashes = @{
  $ImageOne = "1849fcb4d540ef45fad7bf7dffdca3d077ccdd4be806e0c63634cb881f5c2dd5"
  $ImageTwo = "d50906ac2dc424cb0e076fc68bcdf160d703aa5e7cf6e5d3fdc0cc7591a5baeb"
  $Pdf = "798d2061d51962bfc28803970f8d3de2a24055ffac2024742f489bf868520c2c"
}

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

foreach ($source in @($ImageOne, $ImageTwo, $Pdf)) {
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Fonte autorizada ausente: $source" }
  $actual = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $ExpectedHashes[$source]) { throw "Hash divergente para $source" }
}

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) { $args.ContentType = "application/json"; $args.Body = $Body | ConvertTo-Json -Depth 50 -Compress }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 60 } catch { $json = $null } }
  [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}
function Assert-Status { param([string]$Name, [object]$Response, [int[]]$Allowed)
  if ($Response.Status -notin $Allowed) { throw "$Name falhou: HTTP $($Response.Status) $($Response.Response.Content)" }
  Write-Output "PASS $Name HTTP $($Response.Status)"
}
function Invoke-Function { param([string]$Name, [string]$Token, [object]$Body)
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin; "X-Idempotency-Key" = [guid]::NewGuid().ToString() }
  Invoke-Api Post "$ProjectUrl/functions/v1/$Name" $headers $Body
}

$emptySql = @"
select (select count(*) from auth.users) auth_users,
       (select count(*) from public.cms_content_items) items,
       (select count(*) from public.cms_media_assets) media,
       (select count(*) from storage.objects where bucket_id in ('cms-media-private','cms-documents-private')) objects;
"@
$empty = @(Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $emptySql; read_only = $true } | ConvertTo-Json -Compress))[0]
if ($empty.auth_users -ne 0 -or $empty.items -ne 0 -or $empty.media -ne 0 -or $empty.objects -ne 0) {
  throw "Staging não está vazio; recadastro manual recusado."
}

$password = "F4!$([guid]::NewGuid().ToString('N'))"
$actorEmail = "cms-pilot-bootstrap@gaiatecsistemas.com.br"
$actor = Invoke-Api Post "$ProjectUrl/auth/v1/admin/users" @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } @{
  email = $actorEmail; password = $password; email_confirm = $true
  user_metadata = @{ system_actor = $true; synthetic = $false; purpose = "PILOTO-VZ-ELETRO-01"; owner = "Administrador/solicitante GAIATEC" }
}
Assert-Status "bootstrap_actor_created" $actor @(200)
$actorId = [string]$actor.Json.id
$serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=representation" }
Assert-Status "bootstrap_profile" (Invoke-Api Post "$ProjectUrl/rest/v1/cms_profiles" $serviceHeaders @{
  user_id = $actorId; display_name = "Bootstrap autorizado PILOTO-VZ-ELETRO-01"; display_email = $actorEmail; status = "active"
}) @(201)
Assert-Status "bootstrap_roles" (Invoke-Api Post "$ProjectUrl/rest/v1/cms_user_roles" $serviceHeaders @(
  @{ user_id = $actorId; role_key = "editor" }, @{ user_id = $actorId; role_key = "reviewer" }, @{ user_id = $actorId; role_key = "commercial" }
)) @(201)
$login = Invoke-Api Post "$ProjectUrl/auth/v1/token?grant_type=password" @{ apikey = $anonKey } @{ email = $actorEmail; password = $password }
Assert-Status "bootstrap_signin" $login @(200)
$actorToken = [string]$login.Json.access_token

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "gaiatec-f4-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$mediaIds = [System.Collections.Generic.List[string]]::new()
try {
  $mediaSources = @(
    @{ Path = $ImageOne; Alt = "Medidor de vazão eletromagnético GATFLOW-B flangeado, com conversor, visor frontal e pack de bateria ao lado."; Caption = "Imagem autorizada para o esboço piloto em staging; configuração definitiva a confirmar." },
    @{ Path = $ImageTwo; Alt = "Vista frontal do conversor do GATFLOW-B com visor, quatro botões, duas entradas de cabo e pack de bateria."; Caption = "Segunda vista autorizada para o esboço piloto em staging; configuração definitiva a confirmar." }
  )
  foreach ($source in $mediaSources) {
    $mediaCreate = Invoke-Function "cms-media" $actorToken @{ action = "create"; metadata = @{
      originalFilename = [IO.Path]::GetFileName($source.Path); declaredMime = "image/png"; sourceKind = "owner_authored"
      sourceReference = "$($source.Path) | SHA-256 $($ExpectedHashes[$source.Path]) | autorização explícita do solicitante em 2026-08-28 para esboço no staging"
      rightsConfirmed = $true; licenseName = "Autorização explícita — esboço staging"; ownerName = "Administrador/solicitante GAIATEC"
      altText = $source.Alt; caption = $source.Caption; focalX = 0.5; focalY = 0.5
    } }
    Assert-Status "media_reserved_$([IO.Path]::GetFileName($source.Path))" $mediaCreate @(201)
    $assetId = [string]$mediaCreate.Json.assetId
    $assetDir = Join-Path $tempRoot $assetId
    New-Item -ItemType Directory -Path $assetDir | Out-Null
    node -e "const sharp=require('sharp'),fs=require('fs'),path=require('path');(async()=>{const [src,out]=process.argv.slice(1);for(const [key,w] of [['thumbnail',160],['medium',800],['large',1600]])for(const format of ['webp','avif'])await sharp(src).resize({width:w,withoutEnlargement:false}).toFormat(format).toFile(path.join(out,key+'.'+format));})().catch(e=>{console.error(e);process.exit(1)})" $source.Path $assetDir
    foreach ($upload in $mediaCreate.Json.uploads) {
      $local = if ($upload.key -eq "original") { $source.Path } else { Join-Path $assetDir "$($upload.key).$($upload.format)" }
      $mime = if ($upload.key -eq "original") { "image/png" } else { "image/$($upload.format)" }
      $sent = Invoke-WebRequest -Method Put -Uri $upload.signedUrl -ContentType $mime -InFile $local -SkipHttpErrorCheck
      if ([int]$sent.StatusCode -notin @(200, 201)) { throw "Upload de mídia falhou: HTTP $($sent.StatusCode)" }
    }
    $finalized = Invoke-Function "cms-media" $actorToken @{ action = "finalize"; assetId = $assetId }
    Assert-Status "media_finalized_$([IO.Path]::GetFileName($source.Path))" $finalized @(200)
    if ($finalized.Json.sha256 -ne $ExpectedHashes[$source.Path] -or $finalized.Json.variants -ne 6) { throw "Mídia finalizada diverge da fonte." }
    $mediaIds.Add($assetId)
  }

  $documentId = [guid]::NewGuid().ToString()
  $documentPath = "cms-documents/$documentId/KF700E-Battery-powered-Electromagnetic-Flowmeter.pdf"
  $pdfUpload = Invoke-WebRequest -Method Post -Uri "$ProjectUrl/storage/v1/object/cms-documents-private/$documentPath" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; "x-upsert" = "false" } -ContentType "application/pdf" -InFile $Pdf -SkipHttpErrorCheck
  if ([int]$pdfUpload.StatusCode -notin @(200, 201)) { throw "Upload do PDF falhou: HTTP $($pdfUpload.StatusCode)" }
  Write-Output "PASS document_uploaded HTTP $([int]$pdfUpload.StatusCode)"

  $modelId = [guid]::NewGuid().ToString(); $variantId = [guid]::NewGuid().ToString()
  $specIds = 1..10 | ForEach-Object { [guid]::NewGuid().ToString() }
  $blockIds = 1..4 | ForEach-Object { [guid]::NewGuid().ToString() }
  $slug = "medidor-vazao-eletromagnetico-bateria-gatflow-b"
  $verified = [DateTime]::UtcNow.ToString("o")
  function New-Payload([string]$RevisionText) {
    @{
      schemaVersion = 1; consumerId = "cms.catalog-product.v1"; contentType = "product"; pilotState = "homologated"
      title = "Medidor de Vazão Eletromagnético a Bateria GATFLOW-B"
      brand = @{ name = "GATFLOW"; slug = "gatflow" }
      summary = "Piloto funcional homologado e integralmente editável no CMS. GATFLOW é a marca comercial, GATFLOW-B é o modelo comercial e KF700E é a referência do fabricante; fabricante/OEM nominal e especificações definitivas permanecem a confirmar."
      manufacturer = @{ name = "Fabricante do GATFLOW-B — a confirmar"; slug = "fabricante-gatflow-b-a-confirmar" }
      productLine = @{ name = "Medidores eletromagnéticos a bateria"; slug = "medidores-eletromagneticos-bateria" }
      classification = @{ segment = "Instrumentação para líquidos — a confirmar"; category = "Medição de vazão"; subcategory = "Medidor eletromagnético"; family = "Alimentado por bateria" }
      commercial = @{
        shortDescription = "Medidor eletromagnético alimentado por bateria para líquidos condutivos; conteúdo piloto em homologação, com configuração definitiva a confirmar."
        valueProposition = "O PDF técnico da referência KF700E sustenta operação sem alimentação externa e aplicação em pontos remotos. O conteúdo permanece editável para homologação técnica definitiva."
        benefits = @("Operação por bateria, sem alimentação externa", "Sem partes móveis e sem perda de pressão segundo o PDF", "Aplicável a líquidos condutivos compatíveis com os materiais selecionados")
        differentiators = @("Opção de leitura remota quando pareado com GPRS, segundo o PDF", "Eletrodos anti-incrustação e baixa exigência de trechos retos, segundo o PDF")
      }
      function = "Medição de vazão volumétrica de líquidos condutivos"
      technology = "Medição eletromagnética alimentada por bateria"
      models = @(@{ id = $modelId; model = "GATFLOW-B"; manufacturerReference = "KF700E"; sku = "A confirmar"; status = "active"; variants = @(@{ id = $variantId; name = "Configuração sob consulta"; code = "A-CONFIRMAR"; order = 0 }) })
      specifications = @(
        @{ id=$specIds[0]; key="diametro-nominal"; label="Diâmetro nominal"; type="text"; value="A confirmar: o PDF diverge entre DN10–DN600, DN15–DN600 e 15–600 mm"; required=$true; filterable=$false; comparable=$true; searchable=$true },
        @{ id=$specIds[1]; key="velocidade-fluido"; label="Velocidade do fluido"; type="range"; value=@{min=0.3;max=10}; unit="m/s"; required=$true; filterable=$true; comparable=$true; searchable=$true },
        @{ id=$specIds[2]; key="exatidao"; label="Exatidão"; type="text"; value="±1% da leitura, dentro da faixa indicada no PDF"; required=$true; filterable=$false; comparable=$true; searchable=$true },
        @{ id=$specIds[3]; key="condutividade"; label="Condutividade do líquido"; type="text"; value=">20 µS/cm; opção de baixa condutividade até 1 µS/cm"; required=$true; filterable=$false; comparable=$true; searchable=$true },
        @{ id=$specIds[4]; key="alimentacao"; label="Alimentação"; type="text"; value="Baterias de lítio, segundo o PDF; autonomia a confirmar"; required=$true; filterable=$true; comparable=$true; searchable=$true },
        @{ id=$specIds[5]; key="grau-protecao"; label="Grau de proteção"; type="enum"; value=@("IP65","IP67","IP68 — tipo remoto"); required=$true; filterable=$true; comparable=$true; searchable=$true },
        @{ id=$specIds[6]; key="revestimentos"; label="Revestimentos"; type="enum"; value=@("Neoprene","PTFE","F46","PFA"); required=$true; filterable=$true; comparable=$true; searchable=$true },
        @{ id=$specIds[7]; key="temperatura-revestimento"; label="Temperatura por revestimento"; type="text"; value="Neoprene 80 °C; PTFE 130 °C; F46/PFA 150 °C"; required=$true; filterable=$false; comparable=$true; searchable=$true },
        @{ id=$specIds[8]; key="pressao-nominal"; label="Pressão nominal"; type="enum"; value=@("PN6","PN10","PN16","PN40 — varia conforme modelo"); required=$true; filterable=$true; comparable=$true; searchable=$true },
        @{ id=$specIds[9]; key="partes-moveis"; label="Possui partes móveis"; type="boolean"; value=$false; required=$true; filterable=$true; comparable=$true; searchable=$true }
      )
      media = @(
        @{ assetId=$mediaIds[0]; role="primary"; alt="Medidor de vazão eletromagnético GATFLOW-B flangeado, com conversor, visor frontal e pack de bateria ao lado."; caption="Conteúdo piloto em homologação; configuração definitiva a confirmar."; order=0 },
        @{ assetId=$mediaIds[1]; role="gallery"; alt="Vista frontal do conversor do GATFLOW-B com visor, quatro botões, duas entradas de cabo e pack de bateria."; caption="Conteúdo piloto em homologação; configuração definitiva a confirmar."; order=1 }
      )
      documents = @(@{ id=$documentId; kind="datasheet"; title="KF700E Battery-powered Electromagnetic Flowmeter — referência técnica da família"; storagePath=$documentPath; sha256=$ExpectedHashes[$Pdf]; revision="Documento 01-07; revisão não declarada"; language="en"; visibility="public"; rightsConfirmed=$true })
      relations = @{ productIds=@(); applicationIds=@(); sectorIds=@(); serviceIds=@() }
      search = @{ synonyms=@("medidor eletromagnético a bateria","GATFLOW-B","KF700E","medidor de vazão sem alimentação externa"); keywords=@("vazão","líquido condutivo","bateria","eletromagnético","GPRS") }
      redirects = @(@{ sourcePath="/produtos/piloto-vz-eletro-01"; statusCode="302" })
      blocks = @(
        @{ id=$blockIds[0]; type="rich_text"; data=@{ text="Piloto funcional homologado. GATFLOW é a marca comercial própria, GATFLOW-B é o modelo comercial GAIATEC e KF700E é a referência/modelo do fabricante. O fabricante/OEM nominal e as especificações definitivas permanecem editáveis e a confirmar. $RevisionText" } },
        @{ id=$blockIds[1]; type="specifications"; data=@{ source="typed-attributes" } },
        @{ id=$blockIds[2]; type="gallery"; data=@{ assetIds=@($mediaIds[0],$mediaIds[1]) } },
        @{ id=$blockIds[3]; type="related_content"; data=@{ state="Nenhuma relação homologada" } }
      )
      seo = @{ title="GATFLOW-B | Piloto em homologação"; description="Esboço não indexável do medidor eletromagnético a bateria GATFLOW-B, com dados técnicos sustentados pela referência KF700E."; canonicalPath="/produtos/$slug"; indexable=$false }
      provenance = @(
        @{ sourceKind="official_manufacturer"; sourcePath=$Pdf; fileModifiedAt=(Get-Item -LiteralPath $Pdf).LastWriteTimeUtc.ToString("o"); documentVersion="01-07; revisão não declarada"; sourceSha256=$ExpectedHashes[$Pdf]; authorizationReference="Autorização explícita do administrador/solicitante na retomada da Fase 4"; authorizationDate="2026-08-28"; rightsScope="Consulta e uso manual somente no esboço PILOTO-VZ-ELETRO-01 em staging"; rightsConfirmed=$true; commercialOwner="Administrador/solicitante GAIATEC"; technicalOwner="A confirmar na homologação"; verifiedAt=$verified },
        @{ sourceKind="owner_authored"; sourcePath=$ImageOne; fileModifiedAt=(Get-Item -LiteralPath $ImageOne).LastWriteTimeUtc.ToString("o"); sourceSha256=$ExpectedHashes[$ImageOne]; authorizationReference="Autorização explícita do administrador/solicitante na retomada da Fase 4"; authorizationDate="2026-08-28"; rightsScope="Uso da imagem somente no esboço PILOTO-VZ-ELETRO-01 em staging"; rightsConfirmed=$true; commercialOwner="Administrador/solicitante GAIATEC"; technicalOwner="A confirmar na homologação"; verifiedAt=$verified },
        @{ sourceKind="owner_authored"; sourcePath=$ImageTwo; fileModifiedAt=(Get-Item -LiteralPath $ImageTwo).LastWriteTimeUtc.ToString("o"); sourceSha256=$ExpectedHashes[$ImageTwo]; authorizationReference="Autorização explícita do administrador/solicitante na retomada da Fase 4"; authorizationDate="2026-08-28"; rightsScope="Uso da imagem somente no esboço PILOTO-VZ-ELETRO-01 em staging"; rightsConfirmed=$true; commercialOwner="Administrador/solicitante GAIATEC"; technicalOwner="A confirmar na homologação"; verifiedAt=$verified }
      )
      approval = @{ portfolioOwner="Administrador/solicitante GAIATEC — homologação funcional do piloto"; technicalReviewer="Especificações permanecem editáveis e sujeitas a validação definitiva"; commercialReviewer="GATFLOW/GATFLOW-B/KF700E confirmados em 2026-08-29"; editorialReviewer="Clean-room, proveniência e round-trip conferidos"; homologatedAt=$verified }
    }
  }

  $payloadV1 = New-Payload "Versão inicial autorizada."
  $created = Invoke-Function "cms-content" $actorToken @{ action="create"; contentType="product"; slug=$slug; payload=$payloadV1 }
  Assert-Status "product_created" $created @(200)
  $itemId = [string]$created.Json.itemId
  $submitted = Invoke-Function "cms-content" $actorToken @{ action="submit"; itemId=$itemId; expectedLockVersion=1; reason="Revisão manual do lote autorizado PILOTO-VZ-ELETRO-01" }
  Assert-Status "product_submitted" $submitted @(200)
  $revisionOne = [string]$submitted.Json.revisionId
  $approved = Invoke-Function "cms-content" $actorToken @{ action="approve"; itemId=$itemId; revisionId=$revisionOne; reason="Aprovação interna do esboço; homologação visual do owner permanece pendente" }
  Assert-Status "product_reviewed" $approved @(200)
  $previewOne = Invoke-Function "cms-preview" $actorToken @{ itemId=$itemId; revisionId=$revisionOne; maxUses=10; minutes=30 }
  Assert-Status "preview_issued" $previewOne @(201)
  $previewRead = Invoke-Api Get "$ProjectUrl/functions/v1/cms-preview?token=$($previewOne.Json.token)" @{ apikey=$anonKey; Origin=$AllowedOrigin }
  Assert-Status "preview_read" $previewRead @(200)
  if (@($previewRead.Json.media_urls.PSObject.Properties).Count -lt 8 -or @($previewRead.Json.document_urls.PSObject.Properties).Count -ne 1) { throw "Preview não contém mídia/documento fiel." }
  $published = Invoke-Function "cms-content" $actorToken @{ action="publish"; itemId=$itemId; revisionId=$revisionOne; reason="Publicação não indexável do esboço autorizado no staging" }
  Assert-Status "product_published" $published @(200)

  $detail = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=detail&slug=$slug" @{ apikey=$anonKey }
  $list = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=products&category=Medi%C3%A7%C3%A3o%20de%20vaz%C3%A3o" @{ apikey=$anonKey }
  $search = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=search&q=KF700E" @{ apikey=$anonKey }
  $compare = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=products&slugs=$slug" @{ apikey=$anonKey }
  $sitemap = Invoke-WebRequest -Method Get -Uri "$ProjectUrl/functions/v1/cms-public?type=sitemap" -Headers @{ apikey=$anonKey } -SkipHttpErrorCheck
  if ($detail.Status -ne 200 -or $list.Json.total -ne 1 -or $search.Json.total -ne 1 -or $compare.Json.total -ne 1 -or $sitemap.Content -match $slug) { throw "Consumidores públicos divergentes." }
  if (@($detail.Json.media_urls.PSObject.Properties).Count -lt 8 -or @($detail.Json.document_urls.PSObject.Properties).Count -ne 1) { throw "Detalhe não contém duas mídias e PDF assinado." }
  Write-Output "PASS public_list_detail_search_filter_compare_seo"

  $payloadV2 = New-Payload "Segunda revisão: nota de homologação visual reiterada."
  $savedV2 = Invoke-Function "cms-content" $actorToken @{ action="save"; itemId=$itemId; slug=$slug; payload=$payloadV2; expectedLockVersion=1 }
  Assert-Status "revision_two_saved" $savedV2 @(200)
  $submittedV2 = Invoke-Function "cms-content" $actorToken @{ action="submit"; itemId=$itemId; expectedLockVersion=2; reason="Nova revisão controlada do piloto" }
  Assert-Status "revision_two_submitted" $submittedV2 @(200)
  $approvedV2 = Invoke-Function "cms-content" $actorToken @{ action="approve"; itemId=$itemId; revisionId=$submittedV2.Json.revisionId; reason="Revisão controlada aprovada para teste de rollback" }
  Assert-Status "revision_two_reviewed" $approvedV2 @(200)
  $publishedV2 = Invoke-Function "cms-content" $actorToken @{ action="publish"; itemId=$itemId; revisionId=$submittedV2.Json.revisionId; reason="Segunda publicação controlada" }
  Assert-Status "revision_two_published" $publishedV2 @(200)
  $restored = Invoke-Function "cms-content" $actorToken @{ action="restore"; itemId=$itemId; revisionId=$revisionOne; reason="Restauração da revisão inicial autorizada" }
  Assert-Status "revision_one_restored" $restored @(200)
  $restoredDetail = Invoke-Api Get "$ProjectUrl/functions/v1/cms-public?type=detail&slug=$slug" @{ apikey=$anonKey }
  if ($restoredDetail.Json.payload.blocks[0].data.text -notmatch "Versão inicial autorizada") { throw "Rollback não restaurou a revisão inicial." }

  $finalPreview = Invoke-Function "cms-preview" $actorToken @{ itemId=$itemId; revisionId=$revisionOne; maxUses=50; minutes=30 }
  Assert-Status "final_preview_issued" $finalPreview @(201)

  $projectionSql = @"
select
 (select count(*) from public.cms_product_projection where item_id = '$itemId') product_rows,
 (select count(*) from public.cms_product_variant_projection where item_id = '$itemId') variant_rows,
 (select count(*) from public.cms_product_attribute_projection where item_id = '$itemId') attribute_rows,
 (select count(*) from public.cms_product_document_projection where item_id = '$itemId') document_rows,
 (select count(*) from public.cms_media_usages where item_id = '$itemId') media_usage_rows,
 (select count(*) from public.cms_published_projection where content_type = 'product') published_products;
"@
  $projection = @(Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{query=$projectionSql;read_only=$true}|ConvertTo-Json -Compress))[0]
  if ($projection.product_rows -ne 1 -or $projection.variant_rows -ne 1 -or $projection.attribute_rows -ne 10 -or $projection.document_rows -ne 1 -or $projection.media_usage_rows -lt 2 -or $projection.published_products -ne 1) { throw "Projeções incompletas ou órfãs." }
  Write-Output "PASS zero_orphan_fields_and_single_visible_product"

  Assert-Status "bootstrap_profile_suspended" (Invoke-Api Patch "$ProjectUrl/rest/v1/cms_profiles?user_id=eq.$actorId" $serviceHeaders @{ status="suspended"; suspended_at=[DateTime]::UtcNow.ToString("o"); suspended_by=$actorId }) @(200)
  Assert-Status "bootstrap_auth_disabled" (Invoke-Api Put "$ProjectUrl/auth/v1/admin/users/$actorId" @{ apikey=$serviceKey; Authorization="Bearer $serviceKey" } @{ ban_duration="876000h" }) @(200)

  Write-Output "ITEM_ID=$itemId"
  Write-Output "PUBLIC_URL=$AllowedOrigin/produtos/$slug"
  Write-Output "PREVIEW_URL=$AllowedOrigin/preview/$($finalPreview.Json.token)"
  Write-Output "PREVIEW_EXPIRES=$($finalPreview.Json.expiresAt)"
  Write-Output "ACTOR_ID=$actorId"
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  $managementToken=$null; $anonKey=$null; $serviceKey=$null; $password=$null; $actorToken=$null
}
