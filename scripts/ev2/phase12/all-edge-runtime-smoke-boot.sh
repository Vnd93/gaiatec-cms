#!/bin/sh
set -eu

umask 077

bundle_root="${1:-}"
inventory="${2:-}"
attestation="${3:-}"
expected_image='ghcr.io/supabase/edge-runtime:v1.74.3@sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c'
expected_amd64_digest='sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09'
expected_count=34

refuse() {
  printf '%s\n' "$1" >&2
  exit 1
}

test -d "${bundle_root}" && test ! -L "${bundle_root}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_BUNDLE_ROOT_REFUSED
test -f "${inventory}" && test ! -L "${inventory}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_INVENTORY_REFUSED
test -n "${attestation}" && test ! -e "${attestation}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_ATTESTATION_REFUSED
test "${EDGE_RUNTIME_IMAGE:-}" = "${expected_image}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_IMAGE_REFUSED
runtime_exec_image="${EDGE_RUNTIME_EXEC_IMAGE:-${EDGE_RUNTIME_IMAGE:-}}"
case "${runtime_exec_image}" in
  "${expected_image}"|\
  "public.ecr.aws/supabase/edge-runtime@${expected_amd64_digest}"|\
  "ghcr.io/supabase/edge-runtime@${expected_amd64_digest}"|\
  "docker.io/supabase/edge-runtime@${expected_amd64_digest}") ;;
  *) refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_EXEC_IMAGE_REFUSED ;;
esac
test "$(sha256sum "${inventory}" | awk '{print $1}')" = "${G12_INVENTORY_SHA256:-}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_INVENTORY_DIGEST_REFUSED

run_id="${GITHUB_RUN_ID:-0}"
run_attempt="${GITHUB_RUN_ATTEMPT:-0}"
case "${run_id}:${run_attempt}" in
  *[!0-9:]* | :* | *:) refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_RUN_ID_REFUSED ;;
esac

inventory_sorted="${attestation}.inventory.tmp"
bundles_sorted="${attestation}.bundles.tmp"
case "${attestation}" in
  */*) boot_records="${attestation%/*}/boot-records.tsv" ;;
  *) boot_records=boot-records.tsv ;;
esac
records="${boot_records}.tmp"
container_id=''

test ! -e "${boot_records}" && test ! -e "${records}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_RECORDS_REFUSED

cleanup() {
  if test -n "${container_id}"; then
    docker rm --force "${container_id}" >/dev/null 2>&1 || true
    container_id=''
  fi
  rm -f "${inventory_sorted}" "${bundles_sorted}" "${records}" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

if ! awk '
  $0 !~ /^[a-z0-9-]+$/ { exit 1 }
  { count += 1; print }
  END { if (count != 34) exit 1 }
' "${inventory}" | LC_ALL=C sort -u > "${inventory_sorted}"; then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_INVENTORY_SHAPE_REFUSED
fi
test "$(wc -l < "${inventory_sorted}" | tr -d '[:space:]')" = "${expected_count}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_INVENTORY_CARDINALITY_REFUSED
if ! find "${bundle_root}" -mindepth 1 -maxdepth 1 -type f -name '*.eszip' \
  -printf '%f\n' | sed 's/\.eszip$//' | LC_ALL=C sort > "${bundles_sorted}"; then
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_BUNDLE_SCAN_FAILED
fi
cmp -s "${inventory_sorted}" "${bundles_sorted}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_BUNDLE_INVENTORY_REFUSED
: > "${records}"

while IFS= read -r slug; do
  eszip="${bundle_root}/${slug}.eszip"
  test -f "${eszip}" && test ! -L "${eszip}" && test -s "${eszip}" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_ESZIP_REFUSED:${slug}"
  expected_status=200
  test "${slug}" != cms-outbox-worker || expected_status=401
  name="g12-edge-${slug}-${run_id}-${run_attempt}-$$"
  container_id="$(docker run --detach --platform linux/amd64 \
    --name "${name}" \
    --network none \
    --read-only \
    --user "$(id -u):$(id -g)" \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --tmpfs /tmp:rw,nosuid,nodev,size=67108864,mode=1777 \
    --volume "$(realpath -- "${eszip}"):/candidate/output.eszip:ro" \
    --env HOME=/tmp \
    "${runtime_exec_image}" start \
    --ip 0.0.0.0 \
    --port 9000 \
    --main-service /candidate/output.eszip \
    --main-entrypoint "workspace/supabase/functions/${slug}/index.ts")" || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_CONTAINER_REFUSED:${slug}"

  attempt=0
  status_line=''
  while test "${attempt}" -lt 30; do
    attempt=$((attempt + 1))
    status_line="$(docker exec "${container_id}" timeout 3 /bin/bash -c '
      exec 3<>/dev/tcp/127.0.0.1/9000
      printf "OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://gaiatec-cms-staging.pages.dev\r\nConnection: close\r\n\r\n" >&3
      IFS= read -r line <&3
      printf "%s" "$line"
    ' 2>/dev/null || true)"
    case "${status_line}" in
      "HTTP/1.1 ${expected_status} "* | "HTTP/1.0 ${expected_status} "*) break ;;
    esac
    running="$(docker inspect --format '{{.State.Running}}' "${container_id}" 2>/dev/null || true)"
    test "${running}" = true || break
    sleep 1
  done
  case "${status_line}" in
    "HTTP/1.1 ${expected_status} "* | "HTTP/1.0 ${expected_status} "*) ;;
    *)
      docker logs "${container_id}" 2>&1 | tail -c 16384 >&2 || true
      refuse "G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_REQUEST_REFUSED:${slug}"
      ;;
  esac
  printf '%s\t%s\t%s\n' "${slug}" "$(sha256sum "${eszip}" | awk '{print $1}')" \
    "${expected_status}" >> "${records}"
  docker rm --force "${container_id}" >/dev/null || \
    refuse "G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_CLEANUP_REFUSED:${slug}"
  container_id=''
done < "${inventory_sorted}"

test "$(wc -l < "${records}" | tr -d '[:space:]')" = "${expected_count}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_CARDINALITY_REFUSED
{
  printf '%s\n' 'SCHEMA_VERSION=1'
  printf '%s\n' 'EVENT=g12.ci.all_edge_runtime_smoke.boots_verified'
  printf 'CANDIDATE_SHA=%s\n' "${G12_CANDIDATE_SHA:-}"
  printf 'FUNCTION_COUNT=%s\n' "${expected_count}"
  printf 'INVENTORY_SHA256=%s\n' "${G12_INVENTORY_SHA256}"
  printf 'BOOT_RECORDS_SHA256=%s\n' "$(sha256sum "${records}" | awk '{print $1}')"
  printf 'EDGE_RUNTIME_IMAGE=%s\n' "${EDGE_RUNTIME_IMAGE}"
} > "${attestation}.tmp"
mv "${records}" "${boot_records}" || \
  refuse G12_ALL_EDGE_RUNTIME_SMOKE_BOOT_RECORDS_COMMIT_FAILED
mv "${attestation}.tmp" "${attestation}"
printf '{"event":"g12.ci.all_edge_runtime_smoke.boots_verified","candidateSha":"%s","functionCount":%s}\n' \
  "${G12_CANDIDATE_SHA:-}" "${expected_count}"
cleanup
trap - EXIT HUP INT TERM
