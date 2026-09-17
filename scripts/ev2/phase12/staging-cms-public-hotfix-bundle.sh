#!/bin/sh
set -eu

umask 077

mode="${1:-}"
network="${2:-}"
case "${mode}:${network}" in
  online:default|offline:none) ;;
  *) echo "G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_MODE_REFUSED" >&2; exit 64 ;;
esac

input=/workspace
output=/output
eszip="${output}/output.eszip"
unbundled="${output}/unbundled"
unbundled_manifest="${output}/unbundled-files.sha256"
attestation="${output}/build-attestation.env"
bundle_command='edge-runtime bundle --entrypoint /workspace/supabase/functions/cms-public/index.ts --output /output/output.eszip --checksum sha256'
unbundle_command='edge-runtime unbundle --eszip /output/output.eszip --output /output/unbundled'

test "${G12_EDGE_RUNTIME_INDEX_DIGEST:-}" = "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c"
test "${G12_EDGE_RUNTIME_AMD64_DIGEST:-}" = "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09"
test "${G12_PLATFORM:-}" = "linux/amd64"
test "${G12_INPUT_TREE_SHA256:-}" != ""
test "${G12_INPUT_FILE_COUNT:-}" != ""
test -f "${input}/bundle-input-manifest.json"
test -f "${input}/bundle-input-files.json"
test -f "${input}/deno.json"
test -f "${input}/deno.lock"
test -f "${input}/supabase/functions/import_map.json"
test -f "${input}/supabase/functions/cms-public/index.ts"
test ! -e "${eszip}"
test ! -e "${unbundled}"
test ! -e "${unbundled_manifest}"
test ! -e "${attestation}"

edge-runtime bundle \
  --entrypoint /workspace/supabase/functions/cms-public/index.ts \
  --output /output/output.eszip \
  --checksum sha256
test -s "${eszip}"
edge-runtime unbundle --eszip /output/output.eszip --output /output/unbundled
test -d "${unbundled}"

(
  cd "${unbundled}"
  find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum
) > "${unbundled_manifest}"
test -s "${unbundled_manifest}"

sha_value() {
  sha256sum "$1" | awk '{print $1}'
}

byte_count=$(wc -c < "${eszip}" | tr -d '[:space:]')
unbundled_count=$(wc -l < "${unbundled_manifest}" | tr -d '[:space:]')
bundle_command_sha=$(printf '%s' "${bundle_command}" | sha256sum | awk '{print $1}')
unbundle_command_sha=$(printf '%s' "${unbundle_command}" | sha256sum | awk '{print $1}')

{
  printf '%s\n' 'SCHEMA_VERSION=1'
  printf '%s\n' 'EVENT=g12.staging.cms_public_hotfix.bundle_attestation'
  printf 'MODE=%s\n' "${mode}"
  printf 'NETWORK=%s\n' "${network}"
  printf '%s\n' 'CANDIDATE_SHA=e40eb0c2cc81c27fbf8f23e8671136f9dfc6f282'
  printf '%s\n' 'SOURCE_SHA256=84e59669b716a7f43820128ce8de21fa1ae5e69abf9452fa71dfb768a6c8367b'
  printf 'DENO_LOCK_SHA256=%s\n' "$(sha_value "${input}/deno.lock")"
  printf 'DENO_CONFIG_SHA256=%s\n' "$(sha_value "${input}/deno.json")"
  printf 'IMPORT_MAP_SHA256=%s\n' "$(sha_value "${input}/supabase/functions/import_map.json")"
  printf 'INPUT_MANIFEST_SHA256=%s\n' "$(sha_value "${input}/bundle-input-manifest.json")"
  printf 'INPUT_FILES_MANIFEST_SHA256=%s\n' "$(sha_value "${input}/bundle-input-files.json")"
  printf 'INPUT_TREE_SHA256=%s\n' "${G12_INPUT_TREE_SHA256}"
  printf 'INPUT_FILE_COUNT=%s\n' "${G12_INPUT_FILE_COUNT}"
  printf 'RAW_ESZIP_SHA256=%s\n' "$(sha_value "${eszip}")"
  printf 'RAW_ESZIP_BYTES=%s\n' "${byte_count}"
  printf 'UNBUNDLED_FILES_SHA256=%s\n' "$(sha_value "${unbundled_manifest}")"
  printf 'UNBUNDLED_FILE_COUNT=%s\n' "${unbundled_count}"
  printf 'EDGE_RUNTIME_INDEX_DIGEST=%s\n' "${G12_EDGE_RUNTIME_INDEX_DIGEST}"
  printf 'EDGE_RUNTIME_AMD64_DIGEST=%s\n' "${G12_EDGE_RUNTIME_AMD64_DIGEST}"
  printf 'PLATFORM=%s\n' "${G12_PLATFORM}"
  printf 'BUNDLE_COMMAND_SHA256=%s\n' "${bundle_command_sha}"
  printf 'UNBUNDLED_COMMAND_SHA256=%s\n' "${unbundle_command_sha}"
  printf 'BUILDER_SCRIPT_SHA256=%s\n' "$(sha_value "$0")"
  printf '%s\n' 'ESZIP_VALIDATED=true'
} > "${attestation}.tmp"
mv "${attestation}.tmp" "${attestation}"
