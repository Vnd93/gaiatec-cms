#!/bin/sh
set -eu

umask 077

test "${1:-}" = candidate || {
  printf '%s\n' G12_ALL_EDGE_RUNTIME_SMOKE_MODE_REFUSED >&2
  exit 64
}

input=/workspace
output=/output
cache=/deno-cache
inventory="${input}/edge-functions.txt"
manifest="${input}/all-edge-runtime-smoke-input.json"
dependency_index="${input}/edge-function-dependencies.sha256"
expected_count=34
maximum_eszip_bytes=67108864
maximum_aggregate_eszip_bytes=1073741824

refuse() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_equal() {
  test "$1" = "$2" || refuse "$3"
}

require_file() {
  test -f "$1" && test -r "$1" && test ! -L "$1" || refuse "$2"
}

require_directory() {
  test -d "$1" && test -x "$1" && test ! -L "$1" || refuse "$2"
}

require_writable_directory() {
  directory="$1"
  failure="$2"
  probe="${directory}/.g12-write-probe-$$"
  require_directory "${directory}" "${failure}"
  : > "${probe}" || refuse "${failure}"
  rm -f "${probe}" || refuse G12_ALL_EDGE_RUNTIME_SMOKE_PROBE_CLEANUP_FAILED
}

sha_value() {
  sha256sum "$1" | awk '{print $1}'
}

require_equal "${G12_EDGE_RUNTIME_INDEX_DIGEST:-}" \
  "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c" \
  G12_ALL_EDGE_RUNTIME_SMOKE_INDEX_DIGEST_REFUSED
require_equal "${G12_EDGE_RUNTIME_AMD64_DIGEST:-}" \
  "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09" \
  G12_ALL_EDGE_RUNTIME_SMOKE_AMD64_DIGEST_REFUSED
require_equal "${G12_PLATFORM:-}" "linux/amd64" G12_ALL_EDGE_RUNTIME_SMOKE_PLATFORM_REFUSED
require_equal "${JSR_URL:-}" "https://jsr.io/" G12_ALL_EDGE_RUNTIME_SMOKE_JSR_URL_REFUSED
case "${G12_CANDIDATE_SHA:-}" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\
[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) refuse G12_ALL_EDGE_RUNTIME_SMOKE_CANDIDATE_SHA_REFUSED ;;
esac

require_directory "${input}" G12_ALL_EDGE_RUNTIME_SMOKE_INPUT_REFUSED
require_writable_directory "${output}" G12_ALL_EDGE_RUNTIME_SMOKE_OUTPUT_REFUSED
require_writable_directory "${cache}" G12_ALL_EDGE_RUNTIME_SMOKE_CACHE_REFUSED
require_writable_directory /tmp G12_ALL_EDGE_RUNTIME_SMOKE_TMP_REFUSED
require_file "${inventory}" G12_ALL_EDGE_RUNTIME_SMOKE_INVENTORY_REFUSED
require_file "${manifest}" G12_ALL_EDGE_RUNTIME_SMOKE_MANIFEST_REFUSED
require_file "${dependency_index}" G12_ALL_EDGE_RUNTIME_SMOKE_DEPENDENCY_INDEX_REFUSED
test ! -e "${input}/deno.json" && test ! -e "${input}/deno.lock" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_ROOT_DENO_CONFIG_REFUSED
require_file "${input}/supabase/functions/import_map.json" \
  G12_ALL_EDGE_RUNTIME_SMOKE_IMPORT_MAP_REFUSED
require_equal "$(sha_value "${inventory}")" "${G12_INVENTORY_SHA256:-}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_INVENTORY_DIGEST_REFUSED
require_equal "$(sha_value "${manifest}")" "${G12_INPUT_MANIFEST_SHA256:-}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_MANIFEST_DIGEST_REFUSED
require_equal "$(sha_value "${dependency_index}")" "${G12_DEPENDENCY_FILES_SHA256:-}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_DEPENDENCY_INDEX_DIGEST_REFUSED
if ! awk '
  {
    if (NF != 2) exit 1
    if (length($1) != 64 || $1 !~ /^[a-f0-9]+$/) exit 1
    if ($2 !~ /^supabase\/functions\/[a-z0-9-]+\/deno\.(json|lock)$/) exit 1
    if ($0 != $1 "  " $2) exit 1
    count += 1
  }
  END { if (count != 68) exit 1 }
' "${dependency_index}"; then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_DEPENDENCY_INDEX_SHAPE_REFUSED
fi
if ! (cd "${input}" && sha256sum --check --strict --status edge-function-dependencies.sha256); then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_DEPENDENCY_FILE_DIGEST_REFUSED
fi

symlink="$(find "${input}" -type l -print -quit)"
test -z "${symlink}" || refuse G12_ALL_EDGE_RUNTIME_SMOKE_INPUT_SYMLINK_REFUSED
special="$(find "${input}" ! -type d ! -type f ! -type l -print -quit)"
test -z "${special}" || refuse G12_ALL_EDGE_RUNTIME_SMOKE_INPUT_ENTRY_REFUSED

inventory_sorted="/tmp/.g12-all-edge-inventory-$$.txt"
directories_sorted="/tmp/.g12-all-edge-directories-$$.txt"
if ! awk '
  $0 !~ /^[a-z0-9-]+$/ { exit 1 }
  { count += 1; print }
  END { if (count != 34) exit 1 }
' "${inventory}" | LC_ALL=C sort -u > "${inventory_sorted}"; then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_INVENTORY_SHAPE_REFUSED
fi
require_equal "$(wc -l < "${inventory_sorted}" | tr -d '[:space:]')" "${expected_count}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_INVENTORY_CARDINALITY_REFUSED
if ! find "${input}/supabase/functions" -mindepth 1 -maxdepth 1 -type d \
  ! -name _shared -printf '%f\n' | LC_ALL=C sort > "${directories_sorted}"; then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_DIRECTORY_SCAN_FAILED
fi
cmp -s "${inventory_sorted}" "${directories_sorted}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_DIRECTORY_INVENTORY_REFUSED

mkdir "${output}/bundles" "${output}/unbundled" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_OUTPUT_LAYOUT_REFUSED
bundle_records="${output}/runtime-bundles.sha256"
size_records="${output}/runtime-bundles.bytes"
: > "${bundle_records}"
: > "${size_records}"

while IFS= read -r slug; do
  entrypoint="${input}/supabase/functions/${slug}/index.ts"
  function_config="${input}/supabase/functions/${slug}/deno.json"
  function_lock="${input}/supabase/functions/${slug}/deno.lock"
  eszip="${output}/bundles/${slug}.eszip"
  unbundle_root="${output}/unbundled/${slug}"
  unbundled="${unbundle_root}/workspace/supabase/functions/${slug}"
  require_file "${entrypoint}" G12_ALL_EDGE_RUNTIME_SMOKE_ENTRYPOINT_REFUSED
  require_file "${function_config}" "G12_ALL_EDGE_RUNTIME_SMOKE_FUNCTION_CONFIG_REFUSED:${slug}"
  require_file "${function_lock}" "G12_ALL_EDGE_RUNTIME_SMOKE_FUNCTION_LOCK_REFUSED:${slug}"
  test ! -e "${eszip}" && test ! -e "${unbundle_root}" || \
    refuse G12_ALL_EDGE_RUNTIME_SMOKE_OUTPUT_COLLISION_REFUSED
  if ! edge-runtime bundle \
    --entrypoint "${entrypoint}" \
    --output "${eszip}" \
    --checksum sha256; then
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_BUNDLE_FAILED:${slug}"
  fi
  test -s "${eszip}" && test ! -L "${eszip}" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_ESZIP_REFUSED:${slug}"
  if ! edge-runtime unbundle --eszip "${eszip}" --output "${unbundled}"; then
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLE_FAILED:${slug}"
  fi
  require_directory "${unbundle_root}" \
    "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLE_ROOT_REFUSED:${slug}"
  require_directory "${unbundled}" \
    "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLED_DIRECTORY_REFUSED:${slug}"
  if ! unbundled_symlink="$(find "${unbundle_root}" -type l -print -quit)"; then
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLED_SYMLINK_SCAN_FAILED:${slug}"
  fi
  test -z "${unbundled_symlink}" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLED_SYMLINK_REFUSED:${slug}"
  if ! unbundled_file="$(find "${unbundle_root}" -type f -print -quit)"; then
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLED_FILE_SCAN_FAILED:${slug}"
  fi
  test -n "${unbundled_file}" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_UNBUNDLED_EMPTY:${slug}"
  bytes="$(wc -c < "${eszip}" | tr -d '[:space:]')"
  case "${bytes}" in
    "" | *[!0-9]*) refuse "G12_ALL_EDGE_RUNTIME_SMOKE_ESZIP_SIZE_REFUSED:${slug}" ;;
  esac
  printf '{"event":"g12.ci.all_edge_runtime_smoke.bundle_measured","slug":"%s","bytes":%s,"maximumBytes":%s}\n' \
    "${slug}" "${bytes}" "${maximum_eszip_bytes}"
  test "${bytes}" -gt 0 && test "${bytes}" -le "${maximum_eszip_bytes}" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_ESZIP_SIZE_REFUSED:${slug}"
  printf '%s  bundles/%s.eszip\n' "$(sha_value "${eszip}")" "${slug}" >> "${bundle_records}"
  printf '%s\t%s\n' "${slug}" "${bytes}" >> "${size_records}"
done < "${inventory_sorted}"

require_equal "$(wc -l < "${bundle_records}" | tr -d '[:space:]')" "${expected_count}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_BUNDLE_CARDINALITY_REFUSED
require_equal "$(wc -l < "${size_records}" | tr -d '[:space:]')" "${expected_count}" \
  G12_ALL_EDGE_RUNTIME_SMOKE_SIZE_CARDINALITY_REFUSED
aggregate_bytes="$(awk '{ total += $2 } END { printf "%.0f", total }' "${size_records}")"
case "${aggregate_bytes}" in
  "" | *[!0-9]*) refuse G12_ALL_EDGE_RUNTIME_SMOKE_AGGREGATE_SIZE_REFUSED ;;
esac
test "${aggregate_bytes}" -gt 0 && \
  test "${aggregate_bytes}" -le "${maximum_aggregate_eszip_bytes}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_AGGREGATE_SIZE_REFUSED

{
  printf '%s\n' 'SCHEMA_VERSION=1'
  printf '%s\n' 'EVENT=g12.ci.all_edge_runtime_smoke.bundles_verified'
  printf 'CANDIDATE_SHA=%s\n' "${G12_CANDIDATE_SHA}"
  printf 'FUNCTION_COUNT=%s\n' "${expected_count}"
  printf 'INVENTORY_SHA256=%s\n' "${G12_INVENTORY_SHA256}"
  printf 'DEPENDENCY_FILES_SHA256=%s\n' "${G12_DEPENDENCY_FILES_SHA256}"
  printf 'INPUT_MANIFEST_SHA256=%s\n' "${G12_INPUT_MANIFEST_SHA256}"
  printf 'BUNDLES_MANIFEST_SHA256=%s\n' "$(sha_value "${bundle_records}")"
  printf 'SIZES_MANIFEST_SHA256=%s\n' "$(sha_value "${size_records}")"
  printf 'AGGREGATE_ESZIP_BYTES=%s\n' "${aggregate_bytes}"
  printf 'EDGE_RUNTIME_INDEX_DIGEST=%s\n' "${G12_EDGE_RUNTIME_INDEX_DIGEST}"
  printf 'EDGE_RUNTIME_AMD64_DIGEST=%s\n' "${G12_EDGE_RUNTIME_AMD64_DIGEST}"
  printf 'PLATFORM=%s\n' "${G12_PLATFORM}"
} > "${output}/build-attestation.env.tmp"
mv "${output}/build-attestation.env.tmp" "${output}/build-attestation.env"
rm -f "${inventory_sorted}" "${directories_sorted}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_TEMP_CLEANUP_FAILED
printf '{"event":"g12.ci.all_edge_runtime_smoke.bundles_verified","candidateSha":"%s","functionCount":%s,"aggregateEszipBytes":%s}\n' \
  "${G12_CANDIDATE_SHA}" "${expected_count}" "${aggregate_bytes}"
