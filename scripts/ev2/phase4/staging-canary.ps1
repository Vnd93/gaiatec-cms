param(
  [string]$SecretFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TargetRef = "glcqsosxwgmlhzgcsnzv"
$ExpectedName = "GAIATEC CMS Staging"
$ExpectedRegion = "us-east-2"
$ProjectUrl = "https://$TargetRef.supabase.co"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"
$AllowedOrigin = "https://ev2-g4-canary.gaiatec-cms-staging.pages.dev"

$managementToken = $null
$managementHeaders = $null
if ($SecretFile) {
  $tokenLines = @(Select-String -LiteralPath $SecretFile -Pattern '^SUPABASE_ACCESS_TOKEN=' | ForEach-Object { $_.Line })
  if ($tokenLines.Count -ne 1) { throw "Esperada exatamente uma linha SUPABASE_ACCESS_TOKEN." }
  $managementToken = (($tokenLines[0] -split '=', 2)[1]).Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($managementToken)) { throw "SUPABASE_ACCESS_TOKEN vazio." }
  $managementHeaders = @{ Authorization = "Bearer $managementToken"; "Content-Type" = "application/json" }
  $project = Invoke-RestMethod -Method Get -Uri $ManagementUrl -Headers $managementHeaders
}
else {
  $projectsJson = (& npx supabase projects list --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Supabase CLI não autenticado para validar o staging." }
  $project = @($projectsJson | ConvertFrom-Json | Where-Object { $_.ref -eq $TargetRef })[0]
}
if ($project.ref -ne $TargetRef -or $project.name -ne $ExpectedName -or $project.region -ne $ExpectedRegion) {
  throw "ALVO RECUSADO: ref, nome ou região não correspondem ao staging autorizado."
}
if ($managementHeaders) {
  $keys = Invoke-RestMethod -Method Get -Uri "$ManagementUrl/api-keys?reveal=true" -Headers $managementHeaders
}
else {
  $keysJson = (& npx supabase projects api-keys --project-ref $TargetRef --reveal --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível obter as chaves exclusivas do staging." }
  $keys = $keysJson | ConvertFrom-Json
}
$anonKey = ($keys | Where-Object { $_.id -eq "anon" }).api_key
$serviceKey = ($keys | Where-Object { $_.id -eq "service_role" }).api_key
if ([string]::IsNullOrWhiteSpace($anonKey) -or [string]::IsNullOrWhiteSpace($serviceKey)) {
  throw "Chaves exclusivas do staging indisponíveis."
}

$results = [System.Collections.Generic.List[object]]::new()
$userId = $null
$cleanupFailure = $null
$serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=representation" }
$password = "Ev2!$([guid]::NewGuid().ToString('N'))"
$suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$email = "ev2-g4-$([guid]::NewGuid().ToString('N'))@example.invalid"

$manufacturerId = [guid]::NewGuid().ToString()
$categoryId = [guid]::NewGuid().ToString()
$magnitudeId = [guid]::NewGuid().ToString()
$technologyId = [guid]::NewGuid().ToString()
$installationId = [guid]::NewGuid().ToString()
$monitoredElementId = [guid]::NewGuid().ToString()
$attributeDefinitionId = [guid]::NewGuid().ToString()
$attributeSetId = [guid]::NewGuid().ToString()
$attributeSetVersionId = [guid]::NewGuid().ToString()
$productId = [guid]::NewGuid().ToString()
$modelId = [guid]::NewGuid().ToString()
$variantId = [guid]::NewGuid().ToString()
$attributeValueId = [guid]::NewGuid().ToString()
$externalIdentifierId = [guid]::NewGuid().ToString()
$provenanceId = [guid]::NewGuid().ToString()
$canonicalUnit = "g4-m3h-$suffix"
$inputUnit = "g4-lps-$suffix"

function Invoke-Api {
  param([string]$Method, [string]$Uri, [hashtable]$Headers = @{}, [object]$Body = $null)
  $arguments = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true; TimeoutSec = 25 }
  if ($null -ne $Body) {
    $arguments.ContentType = "application/json"
    $arguments.Body = $Body | ConvertTo-Json -Depth 40 -Compress
  }
  $response = Invoke-WebRequest @arguments
  $json = $null
  if ($response.Content) { try { $json = $response.Content | ConvertFrom-Json -Depth 50 } catch { $json = $null } }
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

function Invoke-PimCommand {
  param([string]$Token, [object]$Body, [string]$IdempotencyKey = "")
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin }
  if ($IdempotencyKey) { $headers["X-Idempotency-Key"] = $IdempotencyKey }
  return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/cms-pim" -Headers $headers -Body $Body
}

function Invoke-AttributesCommand {
  param([string]$Token, [object]$Body)
  return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/cms-attributes" -Headers @{
    apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin
  } -Body $Body
}

function Invoke-MasterCommand {
  param([string]$Token, [object]$Body)
  return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/cms-master-data" -Headers @{
    apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin
  } -Body $Body
}

try {
  $created = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/admin/users" -Headers @{
    apikey = $serviceKey; Authorization = "Bearer $serviceKey"
  } -Body @{
    email = $email; password = $password; email_confirm = $true
    user_metadata = @{ synthetic = $true; phase = "ev2-g4" }
  }
  Assert-Check "synthetic_user_created" ($created.Status -eq 200 -and $created.Json.id) "HTTP $($created.Status)"
  $userId = [string]$created.Json.id

  $profile = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_profiles" -Headers $serviceHeaders -Body @{
    user_id = $userId; display_name = "Operador sintético EV2 G4"; display_email = $email; status = "active"
  }
  Assert-Check "synthetic_profile_created" ($profile.Status -eq 201) "HTTP $($profile.Status)"
  $role = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_user_roles" -Headers $serviceHeaders -Body @{
    user_id = $userId; role_key = "technical"
  }
  Assert-Check "technical_role_assigned" ($role.Status -eq 201) "HTTP $($role.Status)"

  $startsAt = [DateTime]::UtcNow.AddSeconds(-5).ToString("o")
  $expiresAt = [DateTime]::UtcNow.AddMinutes(30).ToString("o")
  $overrides = @(
    @{ flag_key = "ev2.pim_v2"; environment = "staging"; scope_type = "user"; scope_key = $userId; enabled = $true; reason = "Canary técnico sintético e descartável do Gate G4"; starts_at = $startsAt; expires_at = $expiresAt; created_by = $userId },
    @{ flag_key = "ev2.master_data"; environment = "staging"; scope_type = "user"; scope_key = $userId; enabled = $true; reason = "Dependência de leitura do editor PIM no canary G4"; starts_at = $startsAt; expires_at = $expiresAt; created_by = $userId }
  )
  $override = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides" -Headers $serviceHeaders -Body $overrides
  Assert-Check "scoped_dependencies_enabled" ($override.Status -eq 201 -and @($override.Json).Count -eq 2) "2 overrides individuais; HTTP $($override.Status)"

  $masterEntities = @(
    @{ id = $manufacturerId; entity_type = "manufacturer"; canonical_name = "G4 Fabricante $suffix"; normalized_name = "g4 fabricante $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ id = $categoryId; entity_type = "category"; canonical_name = "G4 Categoria $suffix"; normalized_name = "g4 categoria $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ id = $magnitudeId; entity_type = "magnitude"; canonical_name = "G4 Vazão $suffix"; normalized_name = "g4 vazao $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ id = $technologyId; entity_type = "technology"; canonical_name = "G4 Ultrassom $suffix"; normalized_name = "g4 ultrassom $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ id = $installationId; entity_type = "installation"; canonical_name = "G4 Clamp-on $suffix"; normalized_name = "g4 clamp on $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ id = $monitoredElementId; entity_type = "monitored_element"; canonical_name = "G4 Água $suffix"; normalized_name = "g4 agua $suffix"; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId }
  )
  $masters = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_master_entities" -Headers $serviceHeaders -Body $masterEntities
  Assert-Check "synthetic_master_entities_created" ($masters.Status -eq 201 -and @($masters.Json).Count -eq 6) "6 entidades; HTTP $($masters.Status)"

  $compatibilities = @(
    @{ relation_type = "category_magnitude"; source_entity_id = $categoryId; target_entity_id = $magnitudeId; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ relation_type = "category_technology"; source_entity_id = $categoryId; target_entity_id = $technologyId; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ relation_type = "category_installation"; source_entity_id = $categoryId; target_entity_id = $installationId; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId },
    @{ relation_type = "category_monitored_element"; source_entity_id = $categoryId; target_entity_id = $monitoredElementId; source_type = "manual"; source_ref = "canary-g4"; created_by = $userId; updated_by = $userId }
  )
  $links = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_master_compatibilities" -Headers $serviceHeaders -Body $compatibilities
  Assert-Check "synthetic_compatibilities_created" ($links.Status -eq 201 -and @($links.Json).Count -eq 4) "4 relações; HTTP $($links.Status)"

  $units = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_pim_units" -Headers $serviceHeaders -Body @(
    @{ code = $canonicalUnit; label = "Metro cúbico por hora G4"; symbol = "m³/h"; dimension_key = "flow_rate"; canonical_code = $canonicalUnit; factor_to_canonical = 1; offset_to_canonical = 0; created_by = $userId; updated_by = $userId },
    @{ code = $inputUnit; label = "Litro por segundo G4"; symbol = "L/s"; dimension_key = "flow_rate"; canonical_code = $canonicalUnit; factor_to_canonical = 3.6; offset_to_canonical = 0; created_by = $userId; updated_by = $userId }
  )
  Assert-Check "units_created" ($units.Status -eq 201 -and @($units.Json).Count -eq 2) "L/s → m³/h; HTTP $($units.Status)"

  $definition = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_pim_attribute_definitions" -Headers $serviceHeaders -Body @{
    id = $attributeDefinitionId; attribute_key = "g4_flow_range_$suffix"; label = "Faixa de vazão G4"; description = "Faixa sintética do canary"
    data_type = "range"; canonical_unit_code = $canonicalUnit; filterable = $true; comparable = $true; searchable = $true
    created_by = $userId; updated_by = $userId
  }
  Assert-Check "attribute_definition_created" ($definition.Status -eq 201) "HTTP $($definition.Status)"
  $set = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_pim_attribute_sets" -Headers $serviceHeaders -Body @{
    id = $attributeSetId; category_id = $categoryId; name = "Atributos G4 $suffix"; created_by = $userId; updated_by = $userId
  }
  Assert-Check "attribute_set_created" ($set.Status -eq 201) "HTTP $($set.Status)"
  $setVersion = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_pim_attribute_set_versions" -Headers $serviceHeaders -Body @{
    id = $attributeSetVersionId; attribute_set_id = $attributeSetId; version = 1; status = "active"; effective_from = [DateTime]::UtcNow.ToString("o"); created_by = $userId
  }
  Assert-Check "attribute_set_version_created" ($setVersion.Status -eq 201) "HTTP $($setVersion.Status)"
  $assignment = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/cms_pim_attribute_set_definitions" -Headers $serviceHeaders -Body @{
    attribute_set_version_id = $attributeSetVersionId; definition_id = $attributeDefinitionId; required = $true; inherited = $true; position = 0
  }
  Assert-Check "attribute_assignment_created" ($assignment.Status -eq 201) "HTTP $($assignment.Status)"

  $signIn = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } -Body @{
    email = $email; password = $password
  }
  Assert-Check "synthetic_signin" ($signIn.Status -eq 200 -and $signIn.Json.access_token) "HTTP $($signIn.Status)"
  $token = [string]$signIn.Json.access_token

  $pimCapability = Invoke-PimCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope }
  $attributesCapability = Invoke-AttributesCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope }
  Assert-Check "pim_and_attributes_capability" (
    $pimCapability.Status -eq 200 -and $pimCapability.Json.enabled -eq $true -and
    $attributesCapability.Status -eq 200 -and $attributesCapability.Json.enabled -eq $true
  ) "PIM HTTP $($pimCapability.Status); atributos HTTP $($attributesCapability.Status)"

  $masterDependency = Invoke-MasterCommand -Token $token -Body @{
    action = "list_entities"; envelope = New-Envelope; entityType = "category"; query = "G4 Categoria $suffix"
  }
  Assert-Check "ui_master_dependency_available" (
    $masterDependency.Status -eq 200 -and @($masterDependency.Json.entities).Count -eq 1 -and $masterDependency.Json.entities[0].id -eq $categoryId
  ) "HTTP $($masterDependency.Status)"

  $catalog = Invoke-AttributesCommand -Token $token -Body @{ action = "list_catalog"; envelope = New-Envelope; categoryId = $categoryId }
  Assert-Check "typed_attribute_catalog_loaded" (
    $catalog.Status -eq 200 -and @($catalog.Json.definitions).Count -eq 1 -and @($catalog.Json.units).Count -eq 2 -and
    $catalog.Json.attributeSet.version -eq 1 -and $catalog.Json.definitions[0].required -eq $true
  ) "1 definição obrigatória; 2 unidades; HTTP $($catalog.Status)"

  $product = @{
    id = $productId; name = "Medidor Ultrassônico G4 $suffix"; slug = "medidor-ultrassonico-g4-$suffix"
    summary = "Produto sintético para o canary EV2.4"; valueProposition = "Medição eficiente sem interromper a linha"
    status = "draft"; sourceType = "manual"; sourceRef = "canary-g4"
    masterData = @{
      manufacturerId = $manufacturerId; categoryId = $categoryId; magnitudeIds = @($magnitudeId)
      technologyIds = @($technologyId); installationIds = @($installationId); monitoredElementIds = @($monitoredElementId)
    }
    models = @(@{
      id = $modelId; name = "UFX-$suffix"; mpn = "G4-MPN-$suffix"; status = "active"; primary = $true; position = 0
      variants = @(@{
        id = $variantId; name = "DN 50"; code = "DN50"; status = "active"; position = 0
        axes = @(@{ axisKey = "diameter"; axisLabel = "Diâmetro"; optionKey = "dn50"; optionLabel = "DN 50" })
      })
    })
    attributes = @(@{
      id = $attributeValueId; definitionId = $attributeDefinitionId; scope = "product"; ownerId = $productId
      value = @{ min = 0; max = 10 }; unitCode = $inputUnit; sourceType = "manual"; sourceRef = "canary-g4"
      confidence = 1; homologated = $true
    })
    externalIdentifiers = @(@{
      id = $externalIdentifierId; ownerType = "model"; ownerId = $modelId; kind = "erp"; value = "G4-ERP-$suffix"
      issuer = "Canary G4"; sourceType = "manual"; sourceRef = "canary-g4"
    })
    provenance = @(@{
      id = $provenanceId; sourceKind = "official_manufacturer"; sourceRef = "synthetic://ev2-g4/$suffix"
      sourceSha256 = ("d" * 64); confidence = 1; rightsConfirmed = $true; verifiedAt = [DateTime]::UtcNow.ToString("o")
    })
  }

  $createEnvelope = New-Envelope
  $createBody = @{ action = "save_product"; envelope = $createEnvelope; mode = "create"; product = $product; reason = "Criação sintética do canary G4" }
  $createKey = [guid]::NewGuid().ToString()
  $createProduct = Invoke-PimCommand -Token $token -IdempotencyKey $createKey -Body $createBody
  Assert-Check "product_graph_created" (
    $createProduct.Status -eq 200 -and $createProduct.Json.productId -eq $productId -and $createProduct.Json.lockVersion -eq 1 -and $createProduct.Json.replayed -eq $false
  ) "HTTP $($createProduct.Status); lock 1"
  $createReplay = Invoke-PimCommand -Token $token -IdempotencyKey $createKey -Body $createBody
  Assert-Check "create_idempotency_replayed" (
    $createReplay.Status -eq 200 -and $createReplay.Json.productId -eq $productId -and $createReplay.Json.replayed -eq $true
  ) "HTTP $($createReplay.Status); replay=true"

  $getProduct = Invoke-PimCommand -Token $token -Body @{ action = "get_product"; envelope = New-Envelope; productId = $productId }
  Assert-Check "normalized_graph_roundtrip" (
    $getProduct.Status -eq 200 -and $getProduct.Json.product.id -eq $productId -and
    @($getProduct.Json.product.models).Count -eq 1 -and @($getProduct.Json.product.models[0].variants).Count -eq 1 -and
    @($getProduct.Json.product.attributes).Count -eq 1 -and @($getProduct.Json.product.provenance).Count -eq 1
  ) "produto, modelo, variante, atributo e proveniência"

  $search = Invoke-PimCommand -Token $token -Body @{
    action = "list_products"; envelope = New-Envelope; query = "Ultrassônico G4 $suffix"; includeArchived = $false
  }
  Assert-Check "accent_insensitive_product_search" (
    $search.Status -eq 200 -and @($search.Json.products).Count -eq 1 -and $search.Json.products[0].id -eq $productId
  ) "HTTP $($search.Status)"

  $canonical = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/cms_pim_attribute_values?product_id=eq.$productId&select=canonical_min,canonical_max" -Headers $serviceHeaders
  Assert-Check "unit_conversion_materialized" (
    $canonical.Status -eq 200 -and @($canonical.Json).Count -eq 1 -and [decimal]$canonical.Json[0].canonical_max -eq [decimal]36
  ) "10 L/s = 36 m³/h"

  $skuEnvelope = New-Envelope
  $skuBody = @{ action = "generate_sku"; envelope = $skuEnvelope; productId = $productId; modelId = $modelId; variantId = $variantId; reason = "Geração sintética de SKU" }
  $skuKey = [guid]::NewGuid().ToString()
  $sku = Invoke-PimCommand -Token $token -IdempotencyKey $skuKey -Body $skuBody
  Assert-Check "immutable_sku_generated" (
    $sku.Status -eq 200 -and $sku.Json.sku.sku -match '^GAI-[A-Z0-9]+-[0-9]{6}$'
  ) "HTTP $($sku.Status); $($sku.Json.sku.sku)"
  $skuReplay = Invoke-PimCommand -Token $token -IdempotencyKey $skuKey -Body $skuBody
  Assert-Check "sku_idempotency_replayed" (
    $skuReplay.Status -eq 200 -and $skuReplay.Json.replayed -eq $true -and $skuReplay.Json.sku.sku -eq $sku.Json.sku.sku
  ) "mesmo SKU; replay=true"

  $preview = Invoke-PimCommand -Token $token -Body @{
    action = "preview_v1_adapter"; envelope = New-Envelope; productId = $productId
    basePayload = @{ summary = "Base v1"; manufacturer = @{}; classification = @{} }
  }
  Assert-Check "v1_adapter_reconciled" (
    $preview.Status -eq 200 -and $preview.Json.payload.title -eq $product.name -and
    $preview.Json.payload.models[0].sku -eq $sku.Json.sku.sku -and
    $preview.Json.payload.controlledClassification.productCategory.id -eq $categoryId -and @($preview.Json.warnings).Count -eq 0
  ) "payload v1 sem alertas"

  $product.name = "Medidor Ultrassônico G4 $suffix Revisado"
  $updateBody = @{ action = "save_product"; envelope = New-Envelope -ExpectedVersion 1; mode = "update"; product = $product; reason = "Atualização otimista do canary G4" }
  $updated = Invoke-PimCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body $updateBody
  Assert-Check "optimistic_update_committed" ($updated.Status -eq 200 -and $updated.Json.lockVersion -eq 2) "HTTP $($updated.Status); lock 2"
  $stale = Invoke-PimCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "save_product"; envelope = New-Envelope -ExpectedVersion 1; mode = "update"; product = $product; reason = "Conflito sintético esperado"
  }
  Assert-Check "stale_update_preserved" (
    $stale.Status -eq 409 -and $stale.Json.code -eq "CMS_PIM_CONFLICT" -and $stale.Json.preserved -eq $true
  ) "HTTP $($stale.Status); conteúdo preservado"

  $anonymousRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/cms_pim_products?select=id&limit=1" -Headers @{
    apikey = $anonKey; Authorization = "Bearer $anonKey"
  }
  Assert-Check "anonymous_pim_read_denied" ($anonymousRead.Status -in @(401, 403)) "HTTP $($anonymousRead.Status)"
  $archive = Invoke-PimCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "archive_product"; envelope = New-Envelope -ExpectedVersion 2; productId = $productId; reason = "Tentativa AAL1 sem permissão crítica"
  }
  Assert-Check "critical_archive_denied_at_aal1" (
    $archive.Status -eq 403 -and $archive.Json.code -eq "CMS_PIM_FORBIDDEN" -and $archive.Json.preserved -eq $true
  ) "HTTP $($archive.Status)"

  $productionPim = Invoke-PimCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope -Environment "production" }
  $productionAttributes = Invoke-AttributesCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope -Environment "production" }
  Assert-Check "production_rejected_by_both_boundaries" (
    $productionPim.Status -eq 403 -and $productionPim.Json.code -eq "CMS_PIM_PRODUCTION_GATED" -and
    $productionAttributes.Status -eq 403 -and $productionAttributes.Json.code -eq "CMS_ATTRIBUTES_PRODUCTION_GATED"
  ) "PIM e atributos HTTP 403"

  $disabled = Invoke-Api -Method Patch -Uri "$ProjectUrl/rest/v1/cms_feature_flag_overrides?created_by=eq.$userId" -Headers $serviceHeaders -Body @{
    enabled = $false; reason = "Canary G4 concluído; kill switch individual validado"; expires_at = [DateTime]::UtcNow.AddMinutes(1).ToString("o")
  }
  Assert-Check "scoped_kill_switch_applied" ($disabled.Status -eq 200 -and @($disabled.Json).Count -eq 2) "2 overrides desabilitados"
  $capabilityOff = Invoke-PimCommand -Token $token -Body @{ action = "capability"; envelope = New-Envelope }
  $mutationOff = Invoke-PimCommand -Token $token -IdempotencyKey ([guid]::NewGuid().ToString()) -Body @{
    action = "generate_sku"; envelope = New-Envelope; productId = $productId; modelId = $modelId; reason = "Mutação bloqueada após kill switch"
  }
  Assert-Check "scoped_kill_switch_effective" (
    $capabilityOff.Status -eq 200 -and $capabilityOff.Json.enabled -eq $false -and
    $mutationOff.Status -eq 403 -and $mutationOff.Json.code -eq "CMS_PIM_FEATURE_DISABLED"
  ) "capacidade false; mutação HTTP 403"

  $globalFlag = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/cms_feature_flags?flag_key=eq.ev2.pim_v2&select=default_enabled,kill_switch" -Headers $serviceHeaders
  Assert-Check "global_flag_unchanged" (
    $globalFlag.Status -eq 200 -and @($globalFlag.Json).Count -eq 1 -and
    $globalFlag.Json[0].default_enabled -eq $false -and $globalFlag.Json[0].kill_switch -eq $false
  ) "default-off; kill switch global inalterado"
}
finally {
  if ($userId) {
    [void][guid]::Parse($userId)
    $cleanupSql = @"
begin;
delete from public.cms_pim_command_receipts where actor_id = '$userId'::uuid;
alter table public.cms_pim_events disable trigger cms_pim_events_immutable;
delete from public.cms_pim_events where actor_id = '$userId'::uuid or product_id = '$productId'::uuid;
alter table public.cms_pim_events enable trigger cms_pim_events_immutable;
delete from public.cms_pim_attribute_values where product_id = '$productId'::uuid;
delete from public.cms_pim_provenance where product_id = '$productId'::uuid;
delete from public.cms_pim_external_identifiers where product_id = '$productId'::uuid;
alter table public.cms_pim_skus disable trigger cms_pim_skus_no_delete;
delete from public.cms_pim_skus where product_id = '$productId'::uuid;
alter table public.cms_pim_skus enable trigger cms_pim_skus_no_delete;
alter table public.cms_pim_variants disable trigger cms_pim_variants_no_delete;
delete from public.cms_pim_variants where product_id = '$productId'::uuid;
alter table public.cms_pim_variants enable trigger cms_pim_variants_no_delete;
alter table public.cms_pim_models disable trigger cms_pim_models_no_delete;
delete from public.cms_pim_models where product_id = '$productId'::uuid;
alter table public.cms_pim_models enable trigger cms_pim_models_no_delete;
delete from public.cms_pim_product_master_links where product_id = '$productId'::uuid;
alter table public.cms_pim_products disable trigger cms_pim_products_no_delete;
delete from public.cms_pim_products where id = '$productId'::uuid;
alter table public.cms_pim_products enable trigger cms_pim_products_no_delete;
delete from public.cms_pim_attribute_set_definitions where attribute_set_version_id = '$attributeSetVersionId'::uuid;
delete from public.cms_pim_attribute_set_versions where id = '$attributeSetVersionId'::uuid;
delete from public.cms_pim_attribute_sets where id = '$attributeSetId'::uuid;
delete from public.cms_pim_attribute_definitions where id = '$attributeDefinitionId'::uuid;
delete from public.cms_pim_units where code = '$inputUnit';
delete from public.cms_pim_units where code = '$canonicalUnit';
alter table public.cms_master_compatibilities disable trigger cms_master_compatibilities_no_delete;
delete from public.cms_master_compatibilities where created_by = '$userId'::uuid;
alter table public.cms_master_compatibilities enable trigger cms_master_compatibilities_no_delete;
alter table public.cms_master_entities disable trigger cms_master_entities_no_delete;
delete from public.cms_master_entities where created_by = '$userId'::uuid;
alter table public.cms_master_entities enable trigger cms_master_entities_no_delete;
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id = '$userId'::uuid and action like 'cms:pim.%';
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
delete from public.cms_feature_flag_overrides where created_by = '$userId'::uuid;
delete from public.cms_user_roles where user_id = '$userId'::uuid;
delete from public.cms_profiles where user_id = '$userId'::uuid;
commit;
"@

    try {
      if ($managementHeaders) {
        $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (
          @{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress
        )
      }
      else {
        $cleanupSqlArgument = $cleanupSql -replace '\s+', ' '
        $cleanupOutput = (& npx supabase db query $cleanupSqlArgument --linked --output json 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0 -or $cleanupOutput -match '"_tag"\s*:\s*"Error"') {
          throw "Falha na limpeza SQL via Supabase CLI."
        }
      }
      $deletedUser = Invoke-Api -Method Delete -Uri "$ProjectUrl/auth/v1/admin/users/$userId" -Headers @{
        apikey = $serviceKey; Authorization = "Bearer $serviceKey"
      }
      if ($deletedUser.Status -ne 200) { throw "Falha ao remover o usuário sintético (HTTP $($deletedUser.Status))." }

      $residueChecks = @(
        @{ Table = "cms_pim_command_receipts"; Filter = "actor_id"; Value = $userId },
        @{ Table = "cms_pim_events"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_products"; Filter = "id"; Value = $productId },
        @{ Table = "cms_pim_product_master_links"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_models"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_variants"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_skus"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_external_identifiers"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_attribute_values"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_provenance"; Filter = "product_id"; Value = $productId },
        @{ Table = "cms_pim_attribute_definitions"; Filter = "id"; Value = $attributeDefinitionId },
        @{ Table = "cms_pim_attribute_sets"; Filter = "id"; Value = $attributeSetId },
        @{ Table = "cms_pim_attribute_set_versions"; Filter = "id"; Value = $attributeSetVersionId },
        @{ Table = "cms_pim_units"; Filter = "created_by"; Value = $userId },
        @{ Table = "cms_master_compatibilities"; Filter = "created_by"; Value = $userId },
        @{ Table = "cms_master_entities"; Filter = "created_by"; Value = $userId },
        @{ Table = "cms_audit_log"; Filter = "actor_id"; Value = $userId },
        @{ Table = "cms_feature_flag_overrides"; Filter = "created_by"; Value = $userId },
        @{ Table = "cms_user_roles"; Filter = "user_id"; Value = $userId },
        @{ Table = "cms_profiles"; Filter = "user_id"; Value = $userId }
      )
      $residueCount = 0
      foreach ($check in $residueChecks) {
        $residue = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/$($check.Table)?$($check.Filter)=eq.$($check.Value)&select=*&limit=1" -Headers $serviceHeaders
        if ($residue.Status -ne 200) { throw "Falha ao reconciliar $($check.Table) (HTTP $($residue.Status))." }
        $residueCount += @($residue.Json).Count
      }
      $deletedUserLookup = Invoke-Api -Method Get -Uri "$ProjectUrl/auth/v1/admin/users/$userId" -Headers @{
        apikey = $serviceKey; Authorization = "Bearer $serviceKey"
      }
      Assert-Check "synthetic_cleanup_verified" (
        $residueCount -eq 0 -and $deletedUserLookup.Status -eq 404
      ) "0 resíduos em 20 escopos; usuário HTTP $($deletedUserLookup.Status)"
    }
    catch {
      $cleanupFailure = $_
      Write-Warning "A limpeza sintética exige auditoria manual: $($_.Exception.Message)"
    }
  }
  $managementToken = $null; $anonKey = $null; $serviceKey = $null; $password = $null
}

if ($cleanupFailure) { throw "Canary funcional aprovado, mas limpeza sintética falhou." }
$results | Format-Table -AutoSize
