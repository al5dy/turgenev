#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
php "$TASK_ROOT/tools/check-version.php"
# Runtime assets are generated from resources/ via Parcel and committed to git.
# Rebuild deterministically and fail if that drifts from what's committed, rather
# than silently packaging stale or hand-edited assets/build output.
npm --prefix "$TASK_ROOT" run build
git -C "$TASK_ROOT" diff --exit-code -- assets/build languages
php "$TASK_ROOT/tools/build-release.php"
