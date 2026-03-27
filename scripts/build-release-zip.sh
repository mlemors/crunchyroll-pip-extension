#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$REPO_ROOT/manifest.json" | head -n1)"
if [[ -z "${VERSION}" ]]; then
  echo "Could not read extension version from manifest.json"
  exit 1
fi

ZIP_NAME="crunchyroll-pip-extension-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

cd "$REPO_ROOT"
zip -r "$ZIP_PATH" manifest.json background.js content.js >/dev/null

echo "Built: $ZIP_PATH"
