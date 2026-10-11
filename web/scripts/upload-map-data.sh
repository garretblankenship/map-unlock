#!/usr/bin/env bash
# Publishes the app's map data to the CDN made by this Amplify backend.
#
#   web/scripts/upload-map-data.sh <boundaries-out-dir> [version]
#
# <boundaries-out-dir> is the output of pipeline/run.sh. [version] names
# the folder (default: v1-<today>); every upload goes to a new folder so
# files never change once published and can be cached for a year.
#
# Needs the AWS CLI (signed in to the account the Amplify app runs in) and
# web/amplify_outputs.json for the branch, from:
#   cd web && npx ampx generate outputs --app-id <amplify-app-id> --branch main
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
web="$(dirname "$here")"
repo="$(dirname "$web")"
src="${1:?Usage: $0 <boundaries-out-dir> [version]}"
version="${2:-v1-$(date -u +%Y-%m-%d)}"
outputs="$web/amplify_outputs.json"

[ -f "$src/meta.json" ] || { echo "No meta.json in $src; is it pipeline/run.sh output?" >&2; exit 1; }
[ -f "$outputs" ] || { echo "Missing $outputs (see the comment at the top of this script)." >&2; exit 1; }
command -v aws >/dev/null || { echo "The AWS CLI is required." >&2; exit 1; }

read_output() { node -e "process.stdout.write(require(process.argv[1]).custom[process.argv[2]] ?? '')" "$outputs" "$1"; }
bucket="$(read_output mapDataBucket)"
cdn="$(read_output mapDataUrl)"
[ -n "$bucket" ] && [ -n "$cdn" ] || { echo "amplify_outputs.json has no map data outputs; deploy the backend first." >&2; exit 1; }

immutable=(--content-type application/json --cache-control 'public, max-age=31536000, immutable')

echo "Uploading boundaries to s3://$bucket/boundaries/$version/ ..."
aws s3 sync "$src" "s3://$bucket/boundaries/$version/" "${immutable[@]}" --exclude '.tmp/*' --only-show-errors

# The style is named by its content, so a changed style gets a new URL and
# offline downloads made with the old one keep matching.
style="$repo/assets/map/style.json"
hash="$(node -e "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex').slice(0, 12))" "$style")"
echo "Uploading map style as map/style-$hash.json ..."
aws s3 cp "$style" "s3://$bucket/map/style-$hash.json" "${immutable[@]}" --only-show-errors

cat <<DONE

Published. Point the app at it by adding these to the production profile's
"env" in eas.json (or as EAS environment variables), then build:

  "BOUNDARIES_URL": "$cdn/boundaries/$version",
  "MAP_STYLE_URL": "$cdn/map/style-$hash.json"

Check: curl -sI $cdn/boundaries/$version/meta.json
DONE
