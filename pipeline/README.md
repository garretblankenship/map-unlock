# Boundary pipeline

Builds the region files the app uses to know which neighbourhood, city,
county, park, state and country you're in. It replaces the public
OpenStreetMap lookup service (Nominatim), which isn't meant for app traffic,
and works offline once files are cached on the phone.

```bash
pipeline/run.sh planet-latest.osm.pbf out/          # worldwide
DEFAULT_COUNTRY=US pipeline/run.sh seattle.osm.pbf out-seattle/   # a regional test extract
```

## What it does

1. **Filter** (`osmium tags-filter`): administrative boundaries, national
   parks, protected areas, nature reserves and neighbourhood polygons.
2. **Assemble** (`osmium export`): ways and relations into polygons.
3. **Build** (`build.ts`):
   - finds the country each area lies in, then classifies it with that
     country's admin_level rules (`classify.ts`);
   - keeps named areas only, parks of protected classes over 1 km², and
     neighbourhood polygons over 0.2 km²;
   - simplifies outlines per level (5 m for neighbourhoods up to 500 m for
     countries) and writes one file per region;
   - clips each region into map tiles so the app can answer "where am I?"
     with one small download per tile group.

## Output

```
out/meta.json                          format version, tile groups and zooms
out/regions/R1274747.json              {id, name, displayName, level, geometry}
out/tiles/local/11/<x>/<y>.json        neighbourhoods and cities
out/tiles/mid/8/<x>/<y>.json           counties and parks
out/tiles/wide/5/<x>/<y>.json          states and countries
```

Tile files are `{"regions": [{id, name, level, area, rings}]}` (area in km²), with rings in the
compact form in `shared/boundaryCodec.ts`. Missing tiles mean "no regions
here". IDs are OpenStreetMap IDs (`R` relation, `W` way), the same as the
app used with Nominatim, so existing progress keeps its regions.

Measured on test extracts: region files are a few KB each (a whole country's
outline is ~3 KB at 500 m simplification). The biggest tile, central Tokyo,
is 125 KB, or 43 KB gzipped.

## Running worldwide

- Download the planet: https://planet.openstreetmap.org/pbf/ (~85 GB).
- A machine with osmium-tool, Node.js 22+, ~16 GB RAM and ~150 GB free disk.
  Filtering takes roughly an hour; the build streams, so memory stays low.
- Upload `out/` to a static host or CDN with gzip enabled, at a URL that
  includes the format version (e.g. `https://…/boundaries/v1/`).
- Re-run every few months to pick up boundary changes; upload to a new
  dated folder and switch the app's URL so caches refresh cleanly.

## Checking classification

The build prints region counts per country and level. Admin levels mean
different things in different countries; `classify.ts` has the defaults
and per-country overrides (AU, CN, JP, KR, NZ so far). For a country that
looks wrong, compare with the admin_level table on the OpenStreetMap wiki
(Tag:boundary=administrative) and add an override.

Known rough edges, handled in the app by keeping the smallest region of
each level at a location: some countries map nested districts at two
neighbourhood levels (Berlin's Mitte borough and Mitte district), and
German cities that are also counties appear as counties.

## Tests

`pipeline.test.ts` (run with the app's `npm test`) covers classification,
geometry (area, inside point, simplification, clipping) and tiles.
`npx tsc -p pipeline` typechecks.
