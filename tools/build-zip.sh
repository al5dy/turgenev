#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
php "$TASK_ROOT/tools/check-version.php"
node "$TASK_ROOT/tools/check-assets.mjs"
php "$TASK_ROOT/tools/build-release.php"
