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
jsr_mirror="${input}/.g12-jsr"
jsr_mirror_manifest="${jsr_mirror}/.g12-mirror-manifest.json"
jsr_mirror_files_manifest="${jsr_mirror}/.g12-mirror-files.sha256"
expected_npm_root_specifiers='["npm:@supabase/auth-js@2.112.4","npm:@supabase/functions-js@2.112.4","npm:@supabase/postgrest-js@2.112.4","npm:@supabase/realtime-js@2.112.4","npm:@supabase/storage-js@2.112.4","npm:openai@^4.52.5","npm:zod@4.4.3"]'
expected_bundle_deno_lock_evidence='{"specifierCount":9,"jsrPackageCount":2,"npmPackageCount":48,"dependencyEdgeCount":59,"serializedBytes":10817,"npmRootSpecifiers":["npm:@supabase/auth-js@2.112.4","npm:@supabase/functions-js@2.112.4","npm:@supabase/postgrest-js@2.112.4","npm:@supabase/realtime-js@2.112.4","npm:@supabase/storage-js@2.112.4","npm:openai@^4.52.5","npm:zod@4.4.3"],"workspaceDependencies":["npm:zod@4.4.3"]}'
bundle_command='edge-runtime bundle --entrypoint /workspace/supabase/functions/cms-public/index.ts --output /output/output.eszip --checksum sha256'
unbundle_command='edge-runtime unbundle --eszip /output/output.eszip --output /output/unbundled/supabase/functions/cms-public'

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

require_uint() {
  value="$1"
  failure_token="$2"
  case "${value}" in
    "" | *[!0-9]*) refuse "${failure_token}" ;;
    0 | [1-9]*) ;;
    *) refuse "${failure_token}" ;;
  esac
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

sha_value() {
  sha256sum "$1" | awk '{print $1}'
}

require_equal "${G12_EDGE_RUNTIME_INDEX_DIGEST:-}" \
  "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_INDEX_DIGEST_REFUSED
require_equal "${G12_EDGE_RUNTIME_AMD64_DIGEST:-}" \
  "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_AMD64_DIGEST_REFUSED
require_equal "${G12_PLATFORM:-}" "linux/amd64" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_PLATFORM_REFUSED
require_equal "${G12_SOURCE_DENO_LOCK_SHA256:-}" \
  "26a8ec603c63c1f9d25fdb1b0c020216d982878c4c5c756467bc29008dd4ba2a" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_SOURCE_DENO_LOCK_REFUSED
require_equal "${G12_BUNDLE_DENO_LOCK_SHA256:-}" \
  "33a32976525fedb037b7b96123119d49af0abe41a90f1b6e0459e9c9b4fecc6f" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_REFUSED
require_equal "${G12_BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS:-}" \
  "${expected_npm_root_specifiers}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_ROOTS_REFUSED
require_equal "${G12_BUNDLE_DENO_LOCK_EVIDENCE_JSON:-}" \
  "${expected_bundle_deno_lock_evidence}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_EVIDENCE_REFUSED
require_nonempty "${G12_INPUT_TREE_SHA256:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_TREE_MISSING
require_nonempty "${G12_INPUT_FILE_COUNT:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_FILE_COUNT_MISSING
require_equal "${JSR_URL:-}" "file:///workspace/.g12-jsr/" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_URL_REFUSED
require_nonempty "${G12_JSR_MIRROR_MANIFEST_SHA256:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_SHA256_MISSING
require_nonempty "${G12_JSR_MIRROR_FILES_MANIFEST_SHA256:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_SHA256_MISSING
require_nonempty "${G12_JSR_MIRROR_TREE_SHA256:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TREE_SHA256_MISSING
require_nonempty "${G12_JSR_MIRROR_FILE_COUNT:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_MISSING
require_nonempty "${G12_JSR_MIRROR_BYTES:-}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_MISSING
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
require_equal "$(sha_value "${input}/deno.lock")" \
  "${G12_BUNDLE_DENO_LOCK_SHA256}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_FILE_REFUSED
require_readable_file "${input}/supabase/functions/import_map.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_IMPORT_MAP_UNREADABLE
require_readable_file "${input}/supabase/functions/cms-public/index.ts" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_ENTRYPOINT_UNREADABLE
require_searchable_directory "${jsr_mirror}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_DIRECTORY_UNREADABLE
test ! -L "${jsr_mirror}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SYMLINK_REFUSED
require_readable_file "${jsr_mirror_manifest}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_UNREADABLE
require_readable_file "${jsr_mirror_files_manifest}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_UNREADABLE
require_readable_file "${jsr_mirror}/@supabase/functions-js/meta.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_REGISTRY_METADATA_UNREADABLE
require_readable_file "${jsr_mirror}/@supabase/functions-js/2.112.4_meta.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_VERSION_METADATA_UNREADABLE
require_readable_file "${jsr_mirror}/@supabase/supabase-js/meta.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_REGISTRY_METADATA_UNREADABLE
require_readable_file "${jsr_mirror}/@supabase/supabase-js/2.112.4_meta.json" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_VERSION_METADATA_UNREADABLE
require_absent "${eszip}" G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_ALREADY_EXISTS
require_absent "${unbundled}" G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_ALREADY_EXISTS
require_absent "${unbundled_manifest}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_ALREADY_EXISTS
require_absent "${attestation}" G12_STAGING_CMS_PUBLIC_HOTFIX_ATTESTATION_ALREADY_EXISTS

mirror_files="/tmp/.g12-jsr-files-$$.nul"
mirror_files_sorted="/tmp/.g12-jsr-files-sorted-$$.nul"
mirror_files_actual="/tmp/.g12-jsr-files-$$.sha256"
mirror_sizes="/tmp/.g12-jsr-sizes-$$.txt"
mirror_symlink="$(find "${jsr_mirror}" -type l -print -quit)"
test -z "${mirror_symlink}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SYMLINK_REFUSED
mirror_special="$(find "${jsr_mirror}" ! -type d ! -type f ! -type l -print -quit)"
test -z "${mirror_special}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_ENTRY_REFUSED
if ! (
  cd "${jsr_mirror}" || exit 1
  find . -type f \
    ! -path './.g12-mirror-manifest.json' \
    ! -path './.g12-mirror-files.sha256' \
    -print0 > "${mirror_files}"
); then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FIND_FAILED
fi
if ! LC_ALL=C sort -z "${mirror_files}" > "${mirror_files_sorted}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SORT_FAILED
fi
if ! (
  cd "${jsr_mirror}" || exit 1
  xargs -0 -r sha256sum --text < "${mirror_files_sorted}"
) > "${mirror_files_actual}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_HASH_FAILED
fi
if ! cmp -s "${mirror_files_actual}" "${jsr_mirror_files_manifest}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_INVENTORY_REFUSED
fi
if ! mirror_count="$(awk 'END { print NR + 0 }' "${mirror_files_actual}")"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_FAILED
fi
if ! (
  cd "${jsr_mirror}" || exit 1
  xargs -0 -r -n 1 wc -c < "${mirror_files_sorted}"
) > "${mirror_sizes}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SIZE_SCAN_FAILED
fi
if ! mirror_bytes="$(awk '{ total += $1 } END { print total + 0 }' "${mirror_sizes}")"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_FAILED
fi
require_equal "$(sha_value "${jsr_mirror_manifest}")" \
  "${G12_JSR_MIRROR_MANIFEST_SHA256}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_REFUSED
require_equal "$(sha_value "${jsr_mirror_files_manifest}")" \
  "${G12_JSR_MIRROR_FILES_MANIFEST_SHA256}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_REFUSED
require_equal "$(sha_value "${mirror_files_actual}")" \
  "${G12_JSR_MIRROR_TREE_SHA256}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TREE_REFUSED
require_equal "${mirror_count}" "${G12_JSR_MIRROR_FILE_COUNT}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_REFUSED
require_equal "${mirror_bytes}" "${G12_JSR_MIRROR_BYTES}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_REFUSED
require_equal "$(sha_value "${jsr_mirror}/@supabase/functions-js/meta.json")" \
  "2d593584eb6f295b742bd3d09f4375f5eded97bb202a37696f728433c523a061" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_REGISTRY_METADATA_REFUSED
require_equal "$(sha_value "${jsr_mirror}/@supabase/functions-js/2.112.4_meta.json")" \
  "6da8c600c7fd727f0d1f0e81b638a13d7f9aaee7269d62e959abc94abb59bb15" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_VERSION_METADATA_REFUSED
require_equal "$(sha_value "${jsr_mirror}/@supabase/supabase-js/meta.json")" \
  "2d593584eb6f295b742bd3d09f4375f5eded97bb202a37696f728433c523a061" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_REGISTRY_METADATA_REFUSED
require_equal "$(sha_value "${jsr_mirror}/@supabase/supabase-js/2.112.4_meta.json")" \
  "f20220bf7de53d493d2f01aa269132b660572ba407e7de68f1b43422b9e8002a" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_VERSION_METADATA_REFUSED
if ! rm -f "${mirror_files}" "${mirror_files_sorted}" "${mirror_files_actual}" "${mirror_sizes}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TEMP_CLEANUP_FAILED
fi

if ! edge-runtime bundle \
  --entrypoint /workspace/supabase/functions/cms-public/index.ts \
  --output /output/output.eszip \
  --checksum sha256; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_BUNDLE_FAILED
fi
test -s "${eszip}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_EMPTY
if ! edge-runtime unbundle \
  --eszip /output/output.eszip \
  --output /output/unbundled/supabase/functions/cms-public; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_UNBUNDLE_FAILED
fi
test -d "${unbundled}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MISSING

unbundled_files="${output}/.unbundled-files.nul"
unbundled_files_sorted="${output}/.unbundled-files.sorted.nul"
unbundled_sizes="${output}/.unbundled-sizes.txt"
unbundled_metrics="${output}/.unbundled-metrics.txt"
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
test -s "${unbundled_manifest}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_EMPTY
unbundled_count=$(wc -l < "${unbundled_manifest}" | tr -d '[:space:]')
if ! (
  cd "${unbundled}" || exit 1
  xargs -0 -r -n 1 wc -c < "${unbundled_files_sorted}"
) > "${unbundled_sizes}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SIZE_SCAN_FAILED
fi
if ! awk '
  $1 !~ /^[0-9]+$/ { invalid = 1; next }
  {
    count += 1
    total += $1
    if ($1 == 0) zero += 1
    if ($1 > largest) largest = $1
  }
  END {
    if (
      invalid ||
      count < 1 || count > 65536 ||
      total < 0 || total > 67108864 ||
      zero < 0 || zero > count ||
      largest < 0 || largest > 2097152 || largest > total ||
      (total == 0 && (largest != 0 || zero != count)) ||
      (total > 0 && (largest < 1 || zero >= count))
    ) exit 1
    printf "%d\n%d\n%.0f\n%.0f\n", count, zero + 0, total + 0, largest + 0
  }
' "${unbundled_sizes}" > "${unbundled_metrics}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
fi
if ! {
  IFS= read -r unbundled_size_count
  IFS= read -r unbundled_zero_byte_file_count
  IFS= read -r unbundled_total_bytes
  IFS= read -r unbundled_largest_file_bytes
} < "${unbundled_metrics}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
fi
require_uint "${unbundled_size_count}" G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
require_uint "${unbundled_zero_byte_file_count}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
require_uint "${unbundled_total_bytes}" G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
require_uint "${unbundled_largest_file_bytes}" \
  G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED
if test "${unbundled_size_count}" != "${unbundled_count}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SIZE_COUNT_REFUSED
fi
if ! rm -f \
  "${unbundled_files}" \
  "${unbundled_files_sorted}" \
  "${unbundled_sizes}" \
  "${unbundled_metrics}"; then
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_TEMP_CLEANUP_FAILED
fi

byte_count=$(wc -c < "${eszip}" | tr -d '[:space:]')
bundle_command_sha=$(printf '%s' "${bundle_command}" | sha256sum | awk '{print $1}')
unbundle_command_sha=$(printf '%s' "${unbundle_command}" | sha256sum | awk '{print $1}')

{
  printf '%s\n' 'SCHEMA_VERSION=1'
  printf '%s\n' 'EVENT=g12.staging.cms_public_hotfix.bundle_attestation'
  printf 'MODE=%s\n' "${mode}"
  printf 'NETWORK=%s\n' "${network}"
  printf '%s\n' 'CANDIDATE_SHA=e40eb0c2cc81c27fbf8f23e8671136f9dfc6f282'
  printf '%s\n' 'SOURCE_SHA256=84e59669b716a7f43820128ce8de21fa1ae5e69abf9452fa71dfb768a6c8367b'
  printf 'SOURCE_DENO_LOCK_SHA256=%s\n' "${G12_SOURCE_DENO_LOCK_SHA256}"
  printf 'BUNDLE_DENO_LOCK_SHA256=%s\n' "${G12_BUNDLE_DENO_LOCK_SHA256}"
  printf 'BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS=%s\n' \
    "${G12_BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS}"
  printf 'BUNDLE_DENO_LOCK_EVIDENCE_JSON=%s\n' \
    "${G12_BUNDLE_DENO_LOCK_EVIDENCE_JSON}"
  printf 'DENO_CONFIG_SHA256=%s\n' "$(sha_value "${input}/deno.json")"
  printf 'IMPORT_MAP_SHA256=%s\n' "$(sha_value "${input}/supabase/functions/import_map.json")"
  printf 'INPUT_MANIFEST_SHA256=%s\n' "$(sha_value "${input}/bundle-input-manifest.json")"
  printf 'INPUT_FILES_MANIFEST_SHA256=%s\n' "$(sha_value "${input}/bundle-input-files.json")"
  printf 'INPUT_TREE_SHA256=%s\n' "${G12_INPUT_TREE_SHA256}"
  printf 'INPUT_FILE_COUNT=%s\n' "${G12_INPUT_FILE_COUNT}"
  printf 'JSR_URL=%s\n' "${JSR_URL}"
  printf 'JSR_MIRROR_MANIFEST_SHA256=%s\n' "${G12_JSR_MIRROR_MANIFEST_SHA256}"
  printf 'JSR_MIRROR_FILES_MANIFEST_SHA256=%s\n' \
    "${G12_JSR_MIRROR_FILES_MANIFEST_SHA256}"
  printf 'JSR_MIRROR_TREE_SHA256=%s\n' "${G12_JSR_MIRROR_TREE_SHA256}"
  printf 'JSR_MIRROR_FILE_COUNT=%s\n' "${G12_JSR_MIRROR_FILE_COUNT}"
  printf 'JSR_MIRROR_BYTES=%s\n' "${G12_JSR_MIRROR_BYTES}"
  printf 'RAW_ESZIP_SHA256=%s\n' "$(sha_value "${eszip}")"
  printf 'RAW_ESZIP_BYTES=%s\n' "${byte_count}"
  printf 'UNBUNDLED_FILES_SHA256=%s\n' "$(sha_value "${unbundled_manifest}")"
  printf 'UNBUNDLED_FILE_COUNT=%s\n' "${unbundled_count}"
  printf 'UNBUNDLED_TOTAL_BYTES=%s\n' "${unbundled_total_bytes}"
  printf 'UNBUNDLED_ZERO_BYTE_FILE_COUNT=%s\n' "${unbundled_zero_byte_file_count}"
  printf 'UNBUNDLED_LARGEST_FILE_BYTES=%s\n' "${unbundled_largest_file_bytes}"
  printf 'EDGE_RUNTIME_INDEX_DIGEST=%s\n' "${G12_EDGE_RUNTIME_INDEX_DIGEST}"
  printf 'EDGE_RUNTIME_AMD64_DIGEST=%s\n' "${G12_EDGE_RUNTIME_AMD64_DIGEST}"
  printf 'PLATFORM=%s\n' "${G12_PLATFORM}"
  printf 'BUNDLE_COMMAND_SHA256=%s\n' "${bundle_command_sha}"
  printf 'UNBUNDLED_COMMAND_SHA256=%s\n' "${unbundle_command_sha}"
  printf 'BUILDER_SCRIPT_SHA256=%s\n' "$(sha_value "$0")"
  printf '%s\n' 'ESZIP_VALIDATED=true'
} > "${attestation}.tmp"
mv "${attestation}.tmp" "${attestation}"
