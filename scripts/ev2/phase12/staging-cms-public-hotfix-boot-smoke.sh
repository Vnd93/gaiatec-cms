#!/bin/sh
set -eu

umask 077

eszip_input="${1:-}"
expected_image='ghcr.io/supabase/edge-runtime:v1.74.3@sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c'

refuse() {
  printf '%s\n' "$1" >&2
  exit 1
}

test -n "${eszip_input}" || refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_ESZIP_MISSING
test -f "${eszip_input}" && test ! -L "${eszip_input}" && test -s "${eszip_input}" || \
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_ESZIP_REFUSED
test "${EDGE_RUNTIME_IMAGE:-}" = "${expected_image}" || \
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_IMAGE_REFUSED

eszip="$(realpath -- "${eszip_input}")" || \
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_ESZIP_PATH_REFUSED
case "${eszip}" in
  /*) ;;
  *) refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_ESZIP_PATH_REFUSED ;;
esac

run_id="${GITHUB_RUN_ID:-0}"
run_attempt="${GITHUB_RUN_ATTEMPT:-0}"
case "${run_id}:${run_attempt}" in
  *[!0-9:]*|:*|*:) refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_RUN_ID_REFUSED ;;
esac

name="g12-cms-public-boot-${run_id}-${run_attempt}-$$"
container_id=''

cleanup() {
  if test -n "${container_id}"; then
    docker rm --force "${container_id}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

container_id="$(docker run --detach --platform linux/amd64 \
  --name "${name}" \
  --network none \
  --read-only \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=67108864,mode=1777 \
  --volume "${eszip}:/candidate/output.eszip:ro" \
  --env HOME=/tmp \
  "${EDGE_RUNTIME_IMAGE}" start \
  --ip 0.0.0.0 \
  --port 9000 \
  --main-service /candidate/output.eszip \
  --main-entrypoint workspace/supabase/functions/cms-public/index.ts)" || \
  refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_CONTAINER_REFUSED

attempt=0
while test "${attempt}" -lt 30; do
  attempt=$((attempt + 1))
  status_line="$(docker exec "${container_id}" timeout 3 /bin/bash -c '
    exec 3<>/dev/tcp/127.0.0.1/9000
    printf "OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n" >&3
    IFS= read -r line <&3
    printf "%s" "$line"
  ' 2>/dev/null || true)"
  case "${status_line}" in
    'HTTP/1.1 200 '*|'HTTP/1.0 200 '*)
    printf '{"event":"g12.staging.cms_public_hotfix.runtime_boot_verified","rawEszipSha256":"%s","status":200}\n' \
      "$(sha256sum "${eszip}" | awk '{print $1}')"
    exit 0
    ;;
  esac
  running="$(docker inspect --format '{{.State.Running}}' "${container_id}" 2>/dev/null || true)"
  test "${running}" = true || break
  sleep 1
done

docker logs "${container_id}" 2>&1 | tail -c 16384 >&2 || true
refuse G12_STAGING_CMS_PUBLIC_HOTFIX_BOOT_REQUEST_REFUSED
