#!/usr/bin/env bash
# One-click: fetch a skill from openclaw/skills and install into Cursor agent skills dir.
# Default preset installs the Cursor CLI agent skill (swiftlysingh/cursor-agent).
#
# Usage:
#   ./scripts/install-openclaw-skill.sh              # preset: openclaw-cursor-agent
#   ./scripts/install-openclaw-skill.sh cursor-agent # same preset (alias)
#   ./scripts/install-openclaw-skill.sh --path skills/author/skill-name
#
# Env:
#   CURSOR_SKILLS_DIR  Target dir (default: ~/.cursor/skills)
#   OPENCLAW_SKILLS_REPO  Raw base URL (default: openclaw/skills main branch)

set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

download() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$out" "$url"
  else
    die "need curl or wget"
  fi
}

OPENCLAW_SKILLS_REPO="${OPENCLAW_SKILLS_REPO:-https://raw.githubusercontent.com/openclaw/skills/main}"
CURSOR_SKILLS_DIR="${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"

resolve_preset() {
  case "$1" in
    cursor-agent | openclaw-cursor-agent | openclaw)
      echo "skills/swiftlysingh/cursor-agent"
      ;;
    *)
      echo ""
      ;;
  esac
}

skill_dir_name_from_path() {
  # skills/swiftlysingh/cursor-agent -> cursor-agent
  basename "$1"
}

usage() {
  sed -n '1,20p' "$0" | tail -n +2
}

REMOTE_PATH=""
if [[ $# -eq 0 ]]; then
  REMOTE_PATH="$(resolve_preset openclaw-cursor-agent)"
elif [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
elif [[ "$1" == "--path" && -n "${2:-}" ]]; then
  REMOTE_PATH="${2#./}"
  REMOTE_PATH="${REMOTE_PATH#/}"
elif [[ "$1" == --path ]]; then
  die "--path requires a value (e.g. skills/swiftlysingh/cursor-agent)"
else
  REMOTE_PATH="$(resolve_preset "$1")"
  [[ -n "$REMOTE_PATH" ]] || die "unknown preset: $1 (try: cursor-agent, or --path skills/...)"
fi

[[ -n "$REMOTE_PATH" ]] || die "no remote path resolved"

SKILL_NAME="$(skill_dir_name_from_path "$REMOTE_PATH")"
DEST="${CURSOR_SKILLS_DIR%/}/${SKILL_NAME}"
BASE="${OPENCLAW_SKILLS_REPO%/}/${REMOTE_PATH}"

mkdir -p "$DEST"

echo "Installing OpenClaw skill → ${DEST}"
echo "Source: ${BASE}/"

fetch_optional() {
  local name="$1"
  local url="${BASE}/${name}"
  if download "$url" "${DEST}/${name}" 2>/dev/null; then
    echo "  ✓ ${name}"
  else
    rm -f "${DEST}/${name}" 2>/dev/null || true
    echo "  · skip ${name} (optional)"
  fi
}

echo "  fetching SKILL.md ..."
download "${BASE}/SKILL.md" "${DEST}/SKILL.md" || die "SKILL.md not found: ${BASE}/SKILL.md"
echo "  ✓ SKILL.md"

fetch_optional README.md
fetch_optional _meta.json

echo "Done. Cursor loads personal skills from: ${CURSOR_SKILLS_DIR}/<skill-name>/"
echo "Restart Cursor or open a new agent chat if the skill does not appear."
