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

refuse() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_equal() {
  test "$1" = "$2" || refuse "$3"
}

require_nonempty() {
  test -n "$1" || refuse "$2"
}

require_searchable_directory() {
  test -d "$1" && test -x "$1" || refuse "$2"
}

require_writable_directory() {
  directory="$1"
  failure_token="$2"
  cleanup_token="$3"
  probe="${directory}/.g12-write-probe-$$"
  require_searchable_directory "${directory}" "${failure_token}"
  if ! (umask 077; : > "${probe}"); then
    refuse "${failure_token}"
  fi
  if ! rm -f "${probe}"; then
    refuse "${cleanup_token}"
  fi
}

require_readable_file() {
  test -f "$1" && test -r "$1" || refuse "$2"
}

require_absent() {
  test ! -e "$1" || refuse "$2"
}

require_equal "${G12_EDGE_RUNTIME_INDEX_DIGEST:-}" \
  "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_INDEX_DIGEST_REFUSED
require_equal "${G12_EDGE_RUNTIME_AMD64_DIGEST:-}" \
  "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_AMD64_DIGEST_REFUSED
require_equal "${G12_PLATFORM:-}" "linux/amd64" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_PLATFORM_REFUSED
require_nonempty "${G12_INPUT_TREE_SHA256:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_TREE_MISSING
require_nonempty "${G12_INPUT_FILE_COUNT:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_FILE_COUNT_MISSING
require_nonempty "${DENO_DIR:-}" G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_MISSING
require_searchable_directory "${input}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_DIRECTORY_UNREADABLE
require_writable_directory "${output}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_OUTPUT_DIRECTORY_UNWRITABLE \
  G12_STAGING_CMS_PUBLIC_HOTFIX_OUTPUT_PROBE_CLEANUP_FAILED
require_writable_directory "${DENO_DIR}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_UNWRITABLE \
  G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_PROBE_CLEANUP_FAILED
require_writable_directory /tmp \
  G12_STAGING_CMS_PUBLIC_HOTFIX_TMP_DIRECTORY_UNWRITABLE \
  G12_STAGING_CMS_PUBLIC_HOTFIX_TMP_PROBE_CLEANUP_FAILED
require_readable_file "${input}/bundle-input-manifest.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_MANIFEST_UNREADABLE
require_readable_file "${input}/bundle-input-files.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_FILES_MANIFEST_UNREADABLE
require_readable_file "${input}/deno.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_CONFIG_UNREADABLE
require_readable_file "${input}/deno.lock" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_LOCK_UNREADABLE
require_readable_file "${input}/supabase/functions/import_map.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_IMPORT_MAP_UNREADABLE
require_readable_file "${input}/supabase/functions/cms-public/index.ts" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_ENTRYPOINT_UNREADABLE
require_absent "${eszip}" G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_ALREADY_EXISTS
require_absent "${unbundled}" G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_ALREADY_EXISTS
require_absent "${unbundled_manifest}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_ALREADY_EXISTS
require_absent "${attestation}" G12_STAGING_CMS_PUBLIC_HOTFIX_ATTESTATION_ALREADY_EXISTS

if ! edge-runtime bundle \
  --entrypoint /workspace/supabase/functions/cms-public/index.ts \
  --output /output/output.eszip \
  --checksum sha256; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_BUNDLE_FAILED
fi
test -s "${eszip}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_EMPTY
if ! edge-runtime unbundle --eszip /output/output.eszip --output /output/unbundled; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_UNBUNDLE_FAILED
fi
test -d "${unbundled}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MISSING

unbundled_files="${output}/.unbundled-files.nul"
unbundled_files_sorted="${output}/.unbundled-files.sorted.nul"
if ! (
  cd "${unbundled}" || exit 1
  find . -type f -print0 > "${unbundled_files}"
); then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_FIND_FAILED
fi
if ! LC_ALL=C sort -z "${unbundled_files}" > "${unbundled_files_sorted}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SORT_FAILED
fi
if ! (
  cd "${unbundled}" || exit 1
  xargs -0 -r sha256sum < "${unbundled_files_sorted}"
) > "${unbundled_manifest}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_HASH_FAILED
fi
if ! rm -f "${unbundled_files}" "${unbundled_files_sorted}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_TEMP_CLEANUP_FAILED
fi
test -s "${unbundled_manifest}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_EMPTY

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
