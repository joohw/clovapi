#!/usr/bin/env bash
# Publish clovapi release artifacts to Cloudflare R2 (S3-compatible API).
#
# Required env:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
# Optional env:
#   R2_ARTIFACT_PREFIX (default: clovapi)
#   R2_PUBLIC_BASE_URL (default: https://downloads.clovapi.com) — logged only
#   R2_SESSION_TOKEN (for temporary R2 S3 credentials)
#
# Usage:
#   ./scripts/r2-publish.sh cli --tag v0.1.12 --dist core/dist
#   ./scripts/r2-publish.sh install-sh --file landing/public/install.sh
#   ./scripts/r2-publish.sh desktop --tag v0.1.12 --file electron/dist/foo.dmg --name clovapi-desktop-darwin-universal.dmg

set -euo pipefail

ARTIFACT_PREFIX="${R2_ARTIFACT_PREFIX:-clovapi}"
PUBLIC_BASE="${R2_PUBLIC_BASE_URL:-https://downloads.clovapi.com}"

log() { printf '[r2-publish] %s\n' "$*"; }
fail() { printf '[r2-publish] error: %s\n' "$*" >&2; exit 1; }

require_r2_env() {
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
  : "${R2_BUCKET:?R2_BUCKET is required}"
}

r2_endpoint() {
  printf 'https://%s.r2.cloudflarestorage.com' "$R2_ACCOUNT_ID"
}

aws_r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_SESSION_TOKEN="${R2_SESSION_TOKEN:-}" \
  AWS_DEFAULT_REGION=auto \
    aws --endpoint-url "$(r2_endpoint)" s3 "$@"
}

normalize_tag() {
  local tag="$1"
  tag="$(printf '%s' "$tag" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$tag" ]]; then
    fail "version tag is empty"
  fi
  if [[ "$tag" != v* ]]; then
    tag="v${tag}"
  fi
  printf '%s' "$tag"
}

publish_cli() {
  local tag="" dist=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="$2"; shift 2 ;;
      --dist) dist="$2"; shift 2 ;;
      *) fail "unknown arg: $1" ;;
    esac
  done
  tag="$(normalize_tag "$tag")"
  [[ -d "$dist" ]] || fail "dist directory not found: $dist"

  local target="s3://${R2_BUCKET}/${ARTIFACT_PREFIX}/${tag}/"
  log "upload CLI dist -> ${target}"
  aws_r2 cp "$dist/" "$target" --recursive

  printf '%s' "$tag" > /tmp/clovapi-latest.txt
  aws_r2 cp /tmp/clovapi-latest.txt "s3://${R2_BUCKET}/${ARTIFACT_PREFIX}/latest.txt"
  log "CLI latest -> ${PUBLIC_BASE}/${ARTIFACT_PREFIX}/latest.txt (${tag})"
}

publish_install_sh() {
  local file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --file) file="$2"; shift 2 ;;
      *) fail "unknown arg: $1" ;;
    esac
  done
  [[ -f "$file" ]] || fail "install script not found: $file"

  aws_r2 cp "$file" "s3://${R2_BUCKET}/install.sh"
  aws_r2 cp "$file" "s3://${R2_BUCKET}/${ARTIFACT_PREFIX}/install.sh"
  log "install.sh -> ${PUBLIC_BASE}/install.sh"
}

publish_desktop() {
  local tag="" file="" name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="$2"; shift 2 ;;
      --file) file="$2"; shift 2 ;;
      --name) name="$2"; shift 2 ;;
      *) fail "unknown arg: $1" ;;
    esac
  done
  tag="$(normalize_tag "$tag")"
  [[ -f "$file" ]] || fail "desktop artifact not found: $file"
  [[ -n "$name" ]] || fail "--name is required"

  local versioned="s3://${R2_BUCKET}/desktop/${tag}/${name}"
  local latest="s3://${R2_BUCKET}/desktop/latest/${name}"

  log "upload desktop ${name} -> ${versioned}"
  aws_r2 cp "$file" "$versioned"
  aws_r2 cp "$file" "$latest"
  printf '%s' "$tag" > /tmp/desktop-latest.txt
  aws_r2 cp /tmp/desktop-latest.txt "s3://${R2_BUCKET}/desktop/latest.txt"
  log "desktop latest -> ${PUBLIC_BASE}/desktop/latest/${name} (${tag})"
}

main() {
  require_r2_env
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    cli) publish_cli "$@" ;;
    install-sh) publish_install_sh "$@" ;;
    desktop) publish_desktop "$@" ;;
    *)
      fail "usage: $0 cli|install-sh|desktop ..."
      ;;
  esac
}

main "$@"
