/**
 * Builds the boundary files the app downloads (see README.md):
 *
 *   node --experimental-strip-types pipeline/build.ts <areas.geojsonseq> <out-dir>
 *
 * The input is osmium's GeoJSON-sequence export of boundary areas (run.sh
 * makes it). Output:
 *   <out>/meta.json                        format version and tile groups
 *   <out>/regions/<id>.json                one region: name, level, outline
 *   <out>/tiles/<group>/<z>/<x>/<y>.json   the regions overlapping a tile,
 *                                          clipped to it, for "where am I?"
 *                                          (rings in src/core/boundaryCodec.ts form)
 * Tiles with no regions are not written; the app treats a 404 as empty.
 *
 * Everything streams, so the whole planet never has to fit in memory: the
 * first pass keeps only (simplified) countries, the second writes each
 * region as it goes and appends tile pieces to per-tile files.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  MIN_PARK_KM2,
  MIN_PLACE_NEIGHBOURHOOD_KM2,
  TILE_GROUPS,
  TOLERANCE_METERS,
  type Level,
  type Tags,
  classify,
  countryCode,
  groupFor,
} from './classify.ts';
import {
  type BBox,
  type Polygon,
  type Ring,
  areaKm2,
  bboxOf,
  clipRing,
  interiorPoint,
  pointInRings,
  polygonsOf,
  roundPolygons,
  simplifyPolygons,
} from './geo.ts';
import { encodeRing } from '../shared/boundaryCodec.ts';
import { tileBBox, tilesFor } from './tiles.ts';

/** Bump when the file format changes; the app checks it. */
export const FORMAT_VERSION = 1;

type Feature = { geometry: { type: string; coordinates: unknown } | null; properties: Tags & { '@type'?: string; '@id'?: number | string } };

async function* features(file: string): AsyncGenerator<Feature> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const raw of lines) {
    const line = raw.replace(/^\u001e/, '').trim();
    if (line) yield JSON.parse(line) as Feature;
  }
}

type Country = { code: string; name: string; bbox: BBox; rings: Ring[] };

function osmId(p: Feature['properties']): string | null {
  const type = p['@type'];
  if (!type || p['@id'] == null) return null;
  return `${type[0].toUpperCase()}${p['@id']}`;
}

export function findCountry(countries: Country[], point: [number, number] | null): Country | null {
  if (!point) return null;
  const [x, y] = point;
  for (const c of countries) {
    const [w, s, e, n] = c.bbox;
    if (x >= w && x <= e && y >= s && y <= n && pointInRings(c.rings, x, y)) return c;
  }
  return null;
}

export type BuildStats = { regions: number; tiles: number; byLevel: Record<string, number>; byCountry: Record<string, Record<string, number>> };

/**
 * The country an area lies in: from the countries in the input, else its own
 * ISO 3166-2 code (e.g. "US-WA"), else the build's default (for regional
 * extracts whose country boundary is cut off at the edge).
 */
function countryFor(
  countries: Country[],
  p: Tags,
  polygons: Polygon[],
  defaultCountry: string | null,
): { code: string; name: string } | null {
  if (p.boundary === 'administrative' && p.admin_level === '2') {
    const code = countryCode(p);
    return code ? (countries.find((c) => c.code === code) ?? { code, name: p.name ?? code }) : null;
  }
  const found = findCountry(countries, interiorPoint(polygons));
  if (found) return found;
  const iso = p['ISO3166-2']?.match(/^([A-Z]{2})-/)?.[1] ?? defaultCountry;
  return iso ? (countries.find((c) => c.code === iso) ?? { code: iso, name: iso }) : null;
}

export async function build(input: string, out: string, defaultCountry: string | null = null): Promise<BuildStats> {
  // Pass 1: countries, simplified hard; they're only used to tell which country an area is in.
  const countries: Country[] = [];
  for await (const f of features(input)) {
    const p = f.properties;
    if (p.boundary !== 'administrative' || p.admin_level !== '2' || !f.geometry) continue;
    const code = countryCode(p);
    if (!code) continue;
    const polys = simplifyPolygons(polygonsOf(f.geometry), 2000);
    countries.push({ code, name: p.name ?? code, bbox: bboxOf(polys), rings: polys.flat() });
  }

  const tmp = join(out, '.tmp');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'regions'), { recursive: true });
  mkdirSync(tmp, { recursive: true });

  // Tile pieces are buffered and appended in batches to keep file writes down.
  const buffer = new Map<string, string[]>();
  let buffered = 0;
  const flush = () => {
    for (const [key, lines] of buffer) {
      const dir = join(tmp, key.slice(0, key.lastIndexOf('/')));
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(tmp, `${key}.ndjson`), lines.join('\n') + '\n');
    }
    buffer.clear();
    buffered = 0;
  };

  const stats: BuildStats = { regions: 0, tiles: 0, byLevel: {}, byCountry: {} };

  // Pass 2: every area.
  for await (const f of features(input)) {
    if (!f.geometry) continue;
    const p = f.properties;
    const id = osmId(p);
    const polygons = polygonsOf(f.geometry);
    if (!id || polygons.length === 0) continue;

    const country = countryFor(countries, p, polygons, defaultCountry);
    const level: Level | null = classify(p, country?.code ?? null);
    if (!level) continue;
    if (level === 'park' && p.boundary !== 'national_park' && areaKm2(polygons) < MIN_PARK_KM2) continue;
    if (level === 'neighbourhood' && p.boundary !== 'administrative' && areaKm2(polygons) < MIN_PLACE_NEIGHBOURHOOD_KM2) {
      continue;
    }

    const shape = roundPolygons(simplifyPolygons(polygons, TOLERANCE_METERS[level]));
    const name = p.name!;
    // A placeholder country name (just its code) isn't worth showing.
    const displayName = level === 'country' || !country || country.name === country.code ? name : `${name}, ${country.name}`;
    writeFileSync(
      join(out, 'regions', `${id}.json`),
      JSON.stringify({ id, name, displayName, level, geometry: { type: 'MultiPolygon', coordinates: shape } }),
    );

    const group = groupFor(level);
    const z = TILE_GROUPS[group].zoom;
    for (const [x, y] of tilesFor(bboxOf(shape), z)) {
      const [w, s, e, n] = tileBBox(z, x, y);
      const eps = 1e-6;
      const rings: number[][] = [];
      for (const poly of shape) {
        for (const ring of poly) {
          const clipped = clipRing(ring, [w - eps, s - eps, e + eps, n + eps]);
          if (clipped.length) rings.push(encodeRing(clipped));
        }
      }
      if (!rings.length) continue;
      const key = `${group}/${z}/${x}/${y}`;
      const list = buffer.get(key) ?? [];
      list.push(JSON.stringify({ id, name, level, rings }));
      buffer.set(key, list);
      if (++buffered >= 20_000) flush();
    }

    stats.regions++;
    stats.byLevel[level] = (stats.byLevel[level] ?? 0) + 1;
    const cc = country?.code ?? '??';
    stats.byCountry[cc] ??= {};
    stats.byCountry[cc][level] = (stats.byCountry[cc][level] ?? 0) + 1;
  }
  flush();

  // Turn each tile's pieces into one JSON file.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ndjson') ? [join(dir, d.name)] : [],
    );
  if (existsSync(tmp)) {
    for (const file of walk(tmp)) {
      const rel = file.slice(tmp.length + 1, -'.ndjson'.length);
      const regions = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const target = join(out, 'tiles', `${rel}.json`);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, JSON.stringify({ regions }));
      stats.tiles++;
    }
    rmSync(tmp, { recursive: true, force: true });
  }

  const groups = Object.fromEntries(Object.entries(TILE_GROUPS).map(([g, v]) => [g, { zoom: v.zoom, levels: v.levels }]));
  writeFileSync(
    join(out, 'meta.json'),
    JSON.stringify({ version: FORMAT_VERSION, generated: new Date().toISOString(), groups, regions: stats.regions }, null, 2),
  );
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const defaultCountry = args.find((a) => a.startsWith('--default-country='))?.split('=')[1] ?? null;
  const [input, out] = args.filter((a) => !a.startsWith('--'));
  if (!input || !out) {
    console.error('Usage: node --experimental-strip-types pipeline/build.ts <areas.geojsonseq> <out-dir> [--default-country=XX]');
    process.exit(1);
  }
  const stats = await build(input, out, defaultCountry);
  console.log(`${stats.regions} regions in ${stats.tiles} tiles`);
  console.log('By level:', stats.byLevel);
  console.log('By country (check new countries against the admin_level table):');
  for (const [cc, levels] of Object.entries(stats.byCountry).sort()) console.log(`  ${cc}`, levels);
}

export type { Polygon };
