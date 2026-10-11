import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

import { scanRings } from './scanline';
import { BASE_ZOOM, keyX, keyY } from './tiles';

/**
 * Water comes from the "water" layer of OpenMapTiles-schema vector tiles
 * (oceans, seas, lakes, rivers, reservoirs...). Each tile at zoom z is
 * rasterized into a 64×64 mask, which lines up exactly with the game grid
 * at level z + 6. Zoom-14 tiles (the most detailed) therefore give water
 * per base cell at level 20.
 */

export const MASK_BITS = 6;
export const MASK_SIZE = 1 << MASK_BITS;
export const WATER_TILE_MAX_ZOOM = BASE_ZOOM - MASK_BITS;

/** 1 = water, 0 = land; null means the whole tile is land. */
export type WaterMask = Uint8Array | null;

/** Answers "is this cell at this grid level water?" for loaded tiles. */
export type WaterLookup = (level: number, x: number, y: number) => boolean;

/** Water classes that shouldn't stay unlocked: they're too small to matter or not really water. */
const IGNORED_CLASSES = new Set(['swimming_pool']);

export function maskFromTile(data: Uint8Array): WaterMask {
  const layer = new VectorTile(new PbfReader(data)).layers.water;
  if (!layer) return null;

  const mask = new Uint8Array(MASK_SIZE * MASK_SIZE);
  let any = false;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    if (IGNORED_CLASSES.has(String(f.properties.class))) continue;
    // Intermittent water (seasonal lakes, dry riverbeds) is usually walkable.
    if (f.properties.intermittent === 1 || f.properties.intermittent === true) continue;

    const rings = f.loadGeometry().map((ring) => {
      const flat = new Float64Array(ring.length * 2);
      ring.forEach((p, k) => {
        flat[k * 2] = p.x;
        flat[k * 2 + 1] = p.y;
      });
      return flat;
    });
    // A feature's rings are its outer boundaries and holes; even-odd fill
    // per feature, then union across features.
    scanRings(
      rings,
      (row, start, end) => {
        for (let x = Math.max(0, start); x < Math.min(MASK_SIZE, end); x++) {
          mask[row * MASK_SIZE + x] = 1;
          any = true;
        }
      },
      MASK_SIZE / f.extent,
      [0, MASK_SIZE],
    );
  }
  return any ? mask : null;
}

export type TileRange = { z: number; x0: number; x1: number; y0: number; y1: number };

export function tileCount(r: TileRange): number {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

/** Water tiles needed to know water for cells at `level` across a cell range. */
export function tilesForCells(level: number, x0: number, x1: number, y0: number, y1: number): TileRange {
  const z = Math.max(0, level - MASK_BITS);
  const shift = 2 ** (level - z);
  return {
    z,
    x0: Math.floor(x0 / shift),
    x1: Math.floor(x1 / shift),
    y0: Math.floor(y0 / shift),
    y1: Math.floor(y1 / shift),
  };
}

/**
 * Looks up water for a cell at any grid level, given loaded tile masks.
 * Below level 6 a cell spans several mask pixels and counts as water when
 * most of it is. Unknown (not yet loaded) tiles read as land.
 */
export function makeWaterLookup(getMask: (z: number, x: number, y: number) => WaterMask | undefined): WaterLookup {
  return (level, x, y) => {
    if (level >= MASK_BITS) {
      const z = level - MASK_BITS;
      const mask = getMask(z, Math.floor(x / MASK_SIZE), Math.floor(y / MASK_SIZE));
      return !!mask && mask[(y % MASK_SIZE) * MASK_SIZE + (x % MASK_SIZE)] === 1;
    }
    const mask = getMask(0, 0, 0);
    if (!mask) return false;
    const span = 2 ** (MASK_BITS - level);
    let water = 0;
    for (let j = y * span; j < (y + 1) * span; j++) {
      for (let i = x * span; i < (x + 1) * span; i++) water += mask[j * MASK_SIZE + i];
    }
    return water * 2 >= span * span;
  };
}

/** Whether a base-zoom cell is water, judged at the given (possibly coarser) level. */
export function isWaterCell(lookup: WaterLookup, key: number, level: number): boolean {
  const d = 2 ** (BASE_ZOOM - level);
  return lookup(level, Math.floor(keyX(key) / d), Math.floor(keyY(key) / d));
}
