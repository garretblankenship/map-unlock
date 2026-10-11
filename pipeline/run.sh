#!/usr/bin/env bash
# Builds the boundary files from OpenStreetMap data.
#
#   pipeline/run.sh <input.osm.pbf> [<input2.osm.pbf> ...] <out-dir>
#
# For a regional extract whose country border is cut off, set
# DEFAULT_COUNTRY (ISO code) so that country's admin_level rules apply.
#
# Worldwide: download the planet (https://planet.openstreetmap.org/, ~85 GB)
# and pass it as the only input. Needs osmium-tool, Node.js 22+, ~150 GB of
# disk and ~16 GB of RAM; see pipeline/README.md. Several regional extracts
# can be passed instead for testing.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <input.osm.pbf> [more.osm.pbf ...] <out-dir>" >&2
  exit 1
fi
out="${!#}"
inputs=("${@:1:$#-1}")
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# 1. Keep only boundaries, protected areas and neighbourhood polygons (plus
#    the ways and nodes they're made of).
filtered=()
for i in "${!inputs[@]}"; do
  osmium tags-filter "${inputs[$i]}" \
    r/boundary=administrative,national_park,protected_area r/leisure=nature_reserve \
    w/boundary=national_park,protected_area w/leisure=nature_reserve \
    r/place=suburb,neighbourhood,quarter w/place=suburb,neighbourhood,quarter \
    -o "$work/filtered-$i.osm.pbf" --overwrite
  filtered+=("$work/filtered-$i.osm.pbf")
done
if [ ${#filtered[@]} -gt 1 ]; then
  osmium merge "${filtered[@]}" -o "$work/filtered.osm.pbf" --overwrite
else
  mv "${filtered[0]}" "$work/filtered.osm.pbf"
fi

# 2. Assemble areas (ways and multipolygon/boundary relations) into GeoJSON.
osmium export "$work/filtered.osm.pbf" -f geojsonseq --geometry-types=polygon,multipolygon \
  -a type,id -o "$work/areas.geojsonseq" --overwrite

# 3. Classify, simplify and tile.
node --experimental-strip-types --no-warnings "$here/build.ts" "$work/areas.geojsonseq" "$out" \
  ${DEFAULT_COUNTRY:+--default-country="$DEFAULT_COUNTRY"}
