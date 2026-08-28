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
$AllowedOrigin = "https://gaiatec-cms-staging.pages.dev"
$ManagementUrl = "https://api.supabase.com/v1/projects/$TargetRef"

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
  throw "Chaves legadas exclusivas do staging não disponíveis."
}

$results = [System.Collections.Generic.List[object]]::new()
$createdUsers = [System.Collections.Generic.List[string]]::new()
$storagePaths = [System.Collections.Generic.List[string]]::new()
$reportIds = [System.Collections.Generic.List[string]]::new()

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )
  $args = @{ Method = $Method; Uri = $Uri; Headers = $Headers; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) {
    $args.ContentType = "application/json"
    $args.Body = $Body | ConvertTo-Json -Depth 12 -Compress
  }
  $response = Invoke-WebRequest @args
  $json = $null
  if ($response.Content) {
    try { $json = $response.Content | ConvertFrom-Json -Depth 20 } catch { $json = $null }
  }
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Json = $json; Response = $response }
}

function Assert-Check {
  param([string]$Name, [bool]$Condition, [string]$Detail)
  $results.Add([pscustomobject]@{ Test = $Name; Result = $(if ($Condition) { "PASS" } else { "FAIL" }); Detail = $Detail })
  if (-not $Condition) { throw "Falha em $Name ($Detail)" }
}

function New-SyntheticUser {
  param([string]$Label, [string]$Password)
  $email = "phase1-$Label-$([guid]::NewGuid().ToString('N'))@example.invalid"
  $headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  $response = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/admin/users" -Headers $headers -Body @{ email = $email; password = $Password; email_confirm = $true; user_metadata = @{ synthetic = $true; phase = 1 } }
  Assert-Check "create_user_$Label" ($response.Status -eq 200) "HTTP $($response.Status)"
  $createdUsers.Add([string]$response.Json.id)
  return [pscustomobject]@{ Id = [string]$response.Json.id; Email = $email }
}

function Get-UserToken {
  param([string]$Email, [string]$Password)
  $response = Invoke-Api -Method Post -Uri "$ProjectUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } -Body @{ email = $Email; password = $Password }
  Assert-Check "signin_synthetic" ($response.Status -eq 200 -and $response.Json.access_token) "HTTP $($response.Status)"
  return [string]$response.Json.access_token
}

function User-Headers {
  param([string]$Token)
  return @{ apikey = $anonKey; Authorization = "Bearer $Token"; Prefer = "return=representation" }
}

function Invoke-Function {
  param([string]$Name, [string]$Token, [object]$Body)
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $Token"; Origin = $AllowedOrigin }
  return Invoke-Api -Method Post -Uri "$ProjectUrl/functions/v1/$Name" -Headers $headers -Body $Body
}

$password = "S1!$([guid]::NewGuid().ToString('N'))"
$onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

try {
  $owner = New-SyntheticUser "owner" $password
  $other = New-SyntheticUser "other" $password
  $admin = New-SyntheticUser "admin" $password
  $suspended = New-SyntheticUser "suspended" $password
  $noAccess = New-SyntheticUser "noaccess" $password

  $serviceHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "return=minimal" }
  $accessRows = @(
    @{ user_id = $owner.Id; role = "rdo_member"; active = $true },
    @{ user_id = $other.Id; role = "rdo_member"; active = $true },
    @{ user_id = $admin.Id; role = "rdo_admin"; active = $true },
    @{ user_id = $suspended.Id; role = "rdo_member"; active = $false }
  )
  $accessInsert = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/rdo_user_access" -Headers $serviceHeaders -Body $accessRows
  Assert-Check "seed_access_allowlist" ($accessInsert.Status -in 200, 201) "HTTP $($accessInsert.Status)"

  $ownerToken = Get-UserToken $owner.Email $password
  $otherToken = Get-UserToken $other.Email $password
  $adminToken = Get-UserToken $admin.Email $password
  $suspendedToken = Get-UserToken $suspended.Email $password
  $noAccessToken = Get-UserToken $noAccess.Email $password

  $noAccessRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?select=id" -Headers (User-Headers $noAccessToken)
  Assert-Check "no_scope_reads_nothing" ($noAccessRead.Status -eq 200 -and @($noAccessRead.Json).Count -eq 0) "HTTP $($noAccessRead.Status)"

  $foreignInsert = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/rdo_relatorios?select=id" -Headers (User-Headers $ownerToken) -Body @{ created_by = $other.Id; cliente = "Sintetico bloqueado" }
  Assert-Check "owner_cannot_forge_foreign_owner" ($foreignInsert.Status -ge 400) "HTTP $($foreignInsert.Status)"

  $draftInsert = Invoke-Api -Method Post -Uri "$ProjectUrl/rest/v1/rdo_relatorios?select=*" -Headers (User-Headers $ownerToken) -Body @{ created_by = $owner.Id; cliente = "Cliente Sintetico Fase 1"; comentarios = "Registro descartavel para matriz remota" }
  Assert-Check "owner_creates_draft" ($draftInsert.Status -eq 201 -and @($draftInsert.Json).Count -eq 1) "HTTP $($draftInsert.Status)"
  $report = @($draftInsert.Json)[0]
  $reportId = [string]$report.id
  $reportIds.Add($reportId)

  $otherRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id" -Headers (User-Headers $otherToken)
  Assert-Check "other_member_cannot_read" ($otherRead.Status -eq 200 -and @($otherRead.Json).Count -eq 0) "HTTP $($otherRead.Status)"
  $suspendedRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id" -Headers (User-Headers $suspendedToken)
  Assert-Check "suspended_member_cannot_read" ($suspendedRead.Status -eq 200 -and @($suspendedRead.Json).Count -eq 0) "HTTP $($suspendedRead.Status)"
  $adminRead = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id" -Headers (User-Headers $adminToken)
  Assert-Check "rdo_admin_can_read" ($adminRead.Status -eq 200 -and @($adminRead.Json).Count -eq 1) "HTTP $($adminRead.Status)"

  $draftUpdate = Invoke-Api -Method Patch -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id,comentarios" -Headers (User-Headers $ownerToken) -Body @{ comentarios = "Rascunho atualizado pelo owner sintetico" }
  Assert-Check "owner_updates_draft" ($draftUpdate.Status -eq 200 -and @($draftUpdate.Json).Count -eq 1) "HTTP $($draftUpdate.Status)"

  $finalize = Invoke-Function "rdo-command" $ownerToken @{ action = "finalize"; reportId = $reportId; idempotencyKey = [guid]::NewGuid().ToString(); signature = @{ gaiatecMethod = "desenho"; gaiatecName = "Responsavel Sintetico"; gaiatecSignature = $onePixelPng; mode = "presencial"; customerSignature = $onePixelPng; customerName = "Cliente Sintetico" } }
  Assert-Check "finalize_drawn_signature" ($finalize.Status -eq 200 -and $finalize.Json.report.canonical_pdf_hash -match '^[0-9a-f]{64}$') "HTTP $($finalize.Status)"
  $canonicalPath = [string]$finalize.Json.report.canonical_pdf_path
  $canonicalHash = [string]$finalize.Json.report.canonical_pdf_hash
  $storagePaths.Add($canonicalPath)

  $maliciousUpdate = Invoke-Api -Method Patch -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id" -Headers (User-Headers $ownerToken) -Body @{ comentarios = "MUTACAO INDEVIDA" }
  $afterUpdate = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id,comentarios" -Headers (User-Headers $ownerToken)
  Assert-Check "signed_update_blocked" (@($afterUpdate.Json).Count -eq 1 -and @($afterUpdate.Json)[0].comentarios -ne "MUTACAO INDEVIDA") "mutation rows $(@($maliciousUpdate.Json).Count)"
  $maliciousDelete = Invoke-Api -Method Delete -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId" -Headers (User-Headers $ownerToken)
  $afterDelete = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/rdo_relatorios?id=eq.$reportId&select=id" -Headers (User-Headers $ownerToken)
  Assert-Check "signed_delete_blocked" (@($afterDelete.Json).Count -eq 1) "HTTP $($maliciousDelete.Status)"

  $correction = Invoke-Function "rdo-command" $ownerToken @{ action = "create_correction"; reportId = $reportId; idempotencyKey = [guid]::NewGuid().ToString(); reason = "Correcao sintetica para teste remoto" }
  Assert-Check "correction_creates_new_version" ($correction.Status -eq 200 -and $correction.Json.report.supersedes_id -eq $reportId -and [int]$correction.Json.report.version_number -eq 2) "HTTP $($correction.Status)"
  $reportIds.Add([string]$correction.Json.report.id)

  $publicObject = Invoke-Api -Method Get -Uri "$ProjectUrl/storage/v1/object/public/rdo-assinados/$canonicalPath" -Headers @{ apikey = $anonKey }
  Assert-Check "canonical_pdf_not_public" ($publicObject.Status -ge 400) "HTTP $($publicObject.Status)"
  $signedUrlResponse = Invoke-Api -Method Post -Uri "$ProjectUrl/storage/v1/object/sign/rdo-assinados/$canonicalPath" -Headers (User-Headers $ownerToken) -Body @{ expiresIn = 300 }
  Assert-Check "authorized_short_signed_url" ($signedUrlResponse.Status -eq 200 -and $signedUrlResponse.Json.signedURL) "HTTP $($signedUrlResponse.Status)"
  $otherSignedUrl = Invoke-Api -Method Post -Uri "$ProjectUrl/storage/v1/object/sign/rdo-assinados/$canonicalPath" -Headers (User-Headers $otherToken) -Body @{ expiresIn = 300 }
  Assert-Check "foreign_member_signed_url_denied" ($otherSignedUrl.Status -ge 400) "HTTP $($otherSignedUrl.Status)"
  $noAccessSignedUrl = Invoke-Api -Method Post -Uri "$ProjectUrl/storage/v1/object/sign/rdo-assinados/$canonicalPath" -Headers (User-Headers $noAccessToken) -Body @{ expiresIn = 300 }
  Assert-Check "no_scope_signed_url_denied" ($noAccessSignedUrl.Status -ge 400) "HTTP $($noAccessSignedUrl.Status)"
  $download = Invoke-WebRequest -Uri "$ProjectUrl/storage/v1$($signedUrlResponse.Json.signedURL)" -SkipHttpErrorCheck
  $pdfBytes = $download.RawContentStream.ToArray()
  $downloadHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($pdfBytes)).ToLowerInvariant()
  Assert-Check "canonical_pdf_hash_matches" ([int]$download.StatusCode -eq 200 -and [Text.Encoding]::ASCII.GetString($pdfBytes[0..4]) -eq "%PDF-" -and $downloadHash -eq $canonicalHash) "HTTP $($download.StatusCode)"

  $unauthorizedCommand = Invoke-Function "rdo-command" $noAccessToken @{ action = "archive"; reportId = $reportId; idempotencyKey = [guid]::NewGuid().ToString() }
  Assert-Check "no_scope_command_denied" ($unauthorizedCommand.Status -eq 403) "HTTP $($unauthorizedCommand.Status)"

  $authListBeforeOtp = Invoke-Api -Method Get -Uri "$ProjectUrl/auth/v1/admin/users?page=1&per_page=1000" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  $userCountBeforeOtp = @($authListBeforeOtp.Json.users).Count
  $otp = Invoke-Function "rdo-otp" $anonKey @{ email = "phase1-unknown@example.invalid" }
  Assert-Check "otp_fails_closed_without_resend" ($otp.Status -eq 503) "HTTP $($otp.Status)"
  $authListAfterOtp = Invoke-Api -Method Get -Uri "$ProjectUrl/auth/v1/admin/users?page=1&per_page=1000" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  Assert-Check "otp_did_not_create_user" (@($authListAfterOtp.Json.users).Count -eq $userCountBeforeOtp) "remote auth count unchanged"
  $notify = Invoke-Function "rdo-notify" $ownerToken @{ action = "finalized"; reportId = $reportId; idempotencyKey = [guid]::NewGuid().ToString() }
  Assert-Check "notify_fails_closed_without_resend" ($notify.Status -eq 503) "HTTP $($notify.Status)"
  $remoteSign = Invoke-Function "rdo-sign" $anonKey @{ action = "get"; token = [guid]::NewGuid().ToString() }
  Assert-Check "remote_sign_fails_closed_without_resend" ($remoteSign.Status -eq 503) "HTTP $($remoteSign.Status)"

  $invalidContact = Invoke-Function "submit-contact" $anonKey @{ idempotencyKey = [guid]::NewGuid().ToString(); firstName = "Teste"; email = "phase1@example.invalid"; message = "Mensagem valida"; consent = $false }
  Assert-Check "contact_requires_consent" ($invalidContact.Status -eq 400) "HTTP $($invalidContact.Status)"
  $oversizedContact = Invoke-Function "submit-contact" $anonKey @{ idempotencyKey = [guid]::NewGuid().ToString(); firstName = "Teste"; email = "phase1-large@example.invalid"; message = ("x" * 17000); consent = $true }
  Assert-Check "contact_body_limit" ($oversizedContact.Status -eq 413) "HTTP $($oversizedContact.Status)"
  $contactsBeforeHoneypot = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/contact_submissions?select=id" -Headers $serviceHeaders
  $honeypotContact = Invoke-Function "submit-contact" $anonKey @{ idempotencyKey = [guid]::NewGuid().ToString(); firstName = "Bot"; email = "phase1-bot@example.invalid"; message = "Mensagem sintetica"; website = "https://spam.invalid"; consent = $true }
  $contactsAfterHoneypot = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/contact_submissions?select=id" -Headers $serviceHeaders
  Assert-Check "contact_honeypot_discards" ($honeypotContact.Status -eq 200 -and @($contactsAfterHoneypot.Json).Count -eq @($contactsBeforeHoneypot.Json).Count) "HTTP $($honeypotContact.Status)"
  $captchaContact = Invoke-Function "submit-contact" $anonKey @{ idempotencyKey = [guid]::NewGuid().ToString(); firstName = "Teste"; email = "phase1-captcha@example.invalid"; message = "https://a.invalid https://b.invalid https://c.invalid"; consent = $true }
  Assert-Check "adaptive_captcha_fails_closed" ($captchaContact.Status -eq 403 -and $captchaContact.Json.captchaRequired) "HTTP $($captchaContact.Status)"
  $contactKey = [guid]::NewGuid().ToString()
  $validContactBody = @{ idempotencyKey = $contactKey; firstName = "Teste"; lastName = "Sintetico"; email = "phase1-contact@example.invalid"; enquiryType = "Outros"; message = "Mensagem sintetica descartavel"; origem = "/fase-1"; consent = $true }
  $validContact = Invoke-Function "submit-contact" $anonKey $validContactBody
  Assert-Check "contact_persists_with_pending_notification" ($validContact.Status -eq 202 -and $validContact.Json.notificationPending) "HTTP $($validContact.Status)"
  $duplicateContact = Invoke-Function "submit-contact" $anonKey $validContactBody
  Assert-Check "contact_idempotency" ($duplicateContact.Status -eq 200 -and $duplicateContact.Json.duplicate) "HTTP $($duplicateContact.Status)"
  $contactOutbox = Invoke-Api -Method Get -Uri "$ProjectUrl/rest/v1/contact_notification_outbox?submission_id=eq.$($validContact.Json.id)&select=status,last_error" -Headers $serviceHeaders
  Assert-Check "contact_notification_fails_closed" (@($contactOutbox.Json).Count -eq 1 -and @($contactOutbox.Json)[0].status -eq "failed" -and @($contactOutbox.Json)[0].last_error -eq "email_not_configured") "outbox recorded failure"
}
finally {
  foreach ($path in $storagePaths) {
    if ($path) { $null = Invoke-Api -Method Delete -Uri "$ProjectUrl/storage/v1/object/rdo-assinados" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" } -Body @{ prefixes = @($path) } }
  }
  if ($createdUsers.Count -gt 0) {
    $ids = ($createdUsers | ForEach-Object { "'$($_ -replace "'", "''")'::uuid" }) -join ","
    $cleanupSql = @"
begin;
lock table public.rdo_relatorios in access exclusive mode;
delete from public.contact_notification_outbox;
delete from public.contact_submissions;
delete from public.rdo_notification_outbox where requested_by in ($ids);
delete from public.rdo_command_receipts where actor_id in ($ids);
delete from public.rdo_audit_events where actor_id in ($ids) or report_id in (select id from public.rdo_relatorios where created_by in ($ids));
delete from public.rdo_fotos where relatorio_id in (select id from public.rdo_relatorios where created_by in ($ids));
alter table public.rdo_relatorios disable trigger rdo_guard_immutable;
delete from public.rdo_relatorios where created_by in ($ids);
alter table public.rdo_relatorios enable trigger rdo_guard_immutable;
delete from public.rdo_user_access where user_id in ($ids);
delete from public.request_rate_limits;
commit;
"@
    $null = Invoke-RestMethod -Method Post -Uri "$ManagementUrl/database/query" -Headers $managementHeaders -Body (@{ query = $cleanupSql; read_only = $false } | ConvertTo-Json -Compress)
  }
  foreach ($userId in $createdUsers) {
    $null = Invoke-Api -Method Delete -Uri "$ProjectUrl/auth/v1/admin/users/$userId" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  }
  $managementToken = $null
  $anonKey = $null
  $serviceKey = $null
  $password = $null
}

$results | Format-Table -AutoSize
