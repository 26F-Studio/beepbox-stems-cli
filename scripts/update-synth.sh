#!/usr/bin/env bash
set -euo pipefail

# Update the vendored BeepBox synthesizer from an upstream checkout or a Git remote.
# Usage:
#   scripts/update-synth.sh [source] [git-ref]
#
# Examples:
#   scripts/update-synth.sh
#   scripts/update-synth.sh https://github.com/johnnesky/beepbox.git main
#   scripts/update-synth.sh /path/to/beepbox-checkout
#
# After updating, run `npm test` unless SKIP_TESTS=1 is set.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-https://github.com/johnnesky/beepbox.git}"
REF="${2:-main}"

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

if [[ -d "$SOURCE" ]]; then
CHECKOUT="$(cd "$SOURCE" && pwd)"
else
CHECKOUT="$TEMP_DIR/beepbox"
git init --quiet "$CHECKOUT"
git -C "$CHECKOUT" remote add origin "$SOURCE"
git -C "$CHECKOUT" fetch --quiet --depth 1 origin "$REF"
git -C "$CHECKOUT" checkout --quiet --detach FETCH_HEAD
fi

if [[ ! -d "$CHECKOUT/synth" ]]; then
echo "error: $CHECKOUT does not contain a synth/ directory" >&2
exit 1
fi

COMMIT="$(git -C "$CHECKOUT" rev-parse HEAD 2>/dev/null || echo unknown)"

rm -rf "$PROJECT_DIR/vendor/beepbox/synth"
cp -R "$CHECKOUT/synth" "$PROJECT_DIR/vendor/beepbox/synth"
cp "$CHECKOUT/LICENSE.md" "$PROJECT_DIR/vendor/beepbox/LICENSE.md"
printf '%s\n' "$COMMIT" > "$PROJECT_DIR/vendor/beepbox/UPSTREAM_COMMIT"

echo "Updated vendor/beepbox/synth to $COMMIT"

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
cd "$PROJECT_DIR"
npm test
fi
