#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(php -r '$p=json_decode(file_get_contents($argv[1]),true); echo $p["version"];' "$ROOT/package.json")"
DIST="$ROOT/dist"
STAGE="$DIST/turgenev"
ZIP="$DIST/turgenev-$VERSION.zip"

rm -rf "$DIST"
mkdir -p "$STAGE"

cp "$ROOT/turgenev.php" "$ROOT/uninstall.php" "$ROOT/readme.txt" "$ROOT/LICENSE" "$STAGE/"
cp -R "$ROOT/src" "$STAGE/"
rm -rf "$STAGE/src/js" "$STAGE/src/css"
cp -R "$ROOT/assets" "$ROOT/languages" "$STAGE/"

( cd "$DIST" && zip -qr "$(basename "$ZIP")" turgenev )
rm -rf "$STAGE"

echo "$ZIP"
