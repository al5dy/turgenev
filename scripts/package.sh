#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PLUGIN_SLUG="turgenev"
MAIN_FILE="$BASE_DIR/turgenev.php"
DIST_DIR="$BASE_DIR/dist"

# Optional explicit version:
#   ./tools/package.sh 2.0.1
# If omitted, the version is read from the WordPress plugin header.
VERSION="${1:-}"

if [[ ! -f "$MAIN_FILE" ]]; then
    echo "Plugin main file not found: $MAIN_FILE"
    exit 1
fi

if [[ -z "$VERSION" ]]; then
    VERSION="$(
        grep -m1 -E '^[[:space:]]*\*[[:space:]]*Version:' "$MAIN_FILE" \
        | sed -E 's/^[[:space:]]*\*[[:space:]]*Version:[[:space:]]*//'
    )"
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid version: $VERSION"
    exit 1
fi

REQUIRED_FILES=(
    "$BASE_DIR/turgenev.php"
    "$BASE_DIR/readme.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "Required plugin file is missing: $file"
        exit 1
    fi
done

REQUIRED_ASSETS=(
    "$BASE_DIR/assets/build/client.js"
    "$BASE_DIR/assets/build/content-reset.js"
    "$BASE_DIR/assets/build/analysis.js"
    "$BASE_DIR/assets/build/highlights.js"
    "$BASE_DIR/assets/build/classic.js"
    "$BASE_DIR/assets/build/editor.js"
    "$BASE_DIR/assets/build/editor-content.js"
    "$BASE_DIR/assets/build/admin.css"
)

for asset in "${REQUIRED_ASSETS[@]}"; do
    if [[ ! -f "$asset" ]]; then
        echo "Compiled runtime asset is missing: $asset"
        echo "Run 'npm run build' first."
        exit 1
    fi
done

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

PLUGIN_DIR="$STAGE_DIR/$PLUGIN_SLUG"

mkdir -p "$PLUGIN_DIR"
mkdir -p "$DIST_DIR"

# Root runtime files.
cp "$MAIN_FILE" "$PLUGIN_DIR/"
cp "$BASE_DIR/readme.txt" "$PLUGIN_DIR/"

if [[ -f "$BASE_DIR/uninstall.php" ]]; then
    cp "$BASE_DIR/uninstall.php" "$PLUGIN_DIR/"
fi

if [[ -f "$BASE_DIR/LICENSE" ]]; then
    cp "$BASE_DIR/LICENSE" "$PLUGIN_DIR/"
fi

# Runtime PHP only. Do not ship development JS/SCSS from src/.
if [[ -d "$BASE_DIR/src" ]]; then
    (
        cd "$BASE_DIR"

        while IFS= read -r -d '' file; do
            mkdir -p "$PLUGIN_DIR/$(dirname "$file")"
            cp "$file" "$PLUGIN_DIR/$file"
        done < <(find src -type f -name '*.php' -print0)
    )
fi

# Compiled browser runtime only.
mkdir -p "$PLUGIN_DIR/assets"
cp -a "$BASE_DIR/assets/build" "$PLUGIN_DIR/assets/"

# WordPress translations.
if [[ -d "$BASE_DIR/languages" ]]; then
    cp -a "$BASE_DIR/languages" "$PLUGIN_DIR/"
fi

ZIP="$DIST_DIR/${PLUGIN_SLUG}-${VERSION}.zip"

rm -f "$ZIP"

(
    cd "$STAGE_DIR"
    zip -qr "$ZIP" "$PLUGIN_SLUG"
)

# Verify archive integrity.
unzip -t "$ZIP" >/dev/null

echo "Created: $ZIP"
