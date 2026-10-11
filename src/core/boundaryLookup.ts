import { decodeRing } from '../../shared/boundaryCodec';
import { type Bounds, tileRangeForBounds } from './mapgeo';
import { REGION_LEVELS, type RegionLevel } from './regions';

/**
 * Reading the boundary files made by pipeline/ (see pipeline/README.md):
 * which tiles cover a place, and which regions in them contain a point.
 */
export const BOUNDARY_FORMAT_VERSION = 1;

export type BoundaryMeta = {
  version: number;
  groups: Record<string, { zoom: number; levels: string[] }>;
};

/** One region's piece of a tile, as stored: rings are encoded (shared/boundaryCodec.ts). */
export type TileRegion = { id: string; name: string; level: string; area: number; rings: number[][] };

export type TileRef = { path: string; group: string };

export function isSupportedMeta(meta: unknown): meta is BoundaryMeta {
  const m = meta as BoundaryMeta | null;
  return !!m && m.version === BOUNDARY_FORMAT_VERSION && typeof m.groups === 'object';
}

/** The tile of each group that covers a point. */
export function tilesAt(meta: BoundaryMeta, lat: number, lon: number): TileRef[] {
  return tilesOver(meta, [lon, lat, lon, lat]);
}

/** Every tile of each group overlapping some bounds (for saving an area offline). */
export function tilesOver(meta: BoundaryMeta, bounds: Bounds): TileRef[] {
  const out: TileRef[] = [];
  for (const [group, { zoom }] of Object.entries(meta.groups)) {
    const r = tileRangeForBounds(bounds, zoom);
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) out.push({ path: `tiles/${group}/${zoom}/${x}/${y}.json`, group });
    }
  }
  return out;
}

function pointInRings(rings: [number, number][][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const isLevel = (l: string): l is RegionLevel => (REGION_LEVELS as readonly string[]).includes(l);

/**
 * The regions containing a point, from the tiles covering it. One region per
 * level, the smallest, since some places map nested districts at the same
 * level (e.g. Berlin's Mitte borough and Mitte district). Parks are the
 * exception: a wilderness inside a national forest is two real goals.
 */
export function regionsContaining(tiles: TileRegion[][], lat: number, lon: number): TileRegion[] {
  const inside: TileRegion[] = [];
  for (const tile of tiles) {
    for (const r of tile) {
      if (isLevel(r.level) && pointInRings(r.rings.map(decodeRing), lon, lat)) inside.push(r);
    }
  }
  const best = new Map<string, TileRegion>();
  const parks: TileRegion[] = [];
  for (const r of inside) {
    if (r.level === 'park') {
      if (!parks.some((p) => p.id === r.id)) parks.push(r);
      continue;
    }
    const cur = best.get(r.level);
    if (!cur || r.area < cur.area) best.set(r.level, r);
  }
  return [...best.values(), ...parks];
}
