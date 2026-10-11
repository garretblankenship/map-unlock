import { GeoJsonGeometry, Shape, scanShape, shapeCellCount, shapeContainsCell, shapeFromGeoJson } from './geometry';
import { BASE_ZOOM } from './tiles';
import { MASK_BITS, TileRange, WATER_TILE_MAX_ZOOM, WaterLookup, isWaterCell, tileCount } from './water';

/**
 * Kinds of region we track, in the order they're listed: administrative
 * areas from smallest to largest, with parks & forests (national/state
 * parks, national forests, wilderness and nature reserves) after counties.
 */
export const REGION_LEVELS = ['neighbourhood', 'city', 'county', 'park', 'state', 'country'] as const;

/** Local areas: being inside one means the boundaries around you are known. */
export const LOCAL_LEVELS: readonly RegionLevel[] = ['neighbourhood', 'city', 'county', 'park'];
export type RegionLevel = (typeof REGION_LEVELS)[number];

export type RegionRecord = {
  /** Stable OpenStreetMap id, e.g. "R5750005". */
  id: string;
  name: string;
  displayName: string;
  level: RegionLevel;
  geometry: GeoJsonGeometry;
  createdAt: number;
};

export type Region = RegionRecord & {
  shape: Shape;
  /** Number of base cells inside the region, land and water. */
  totalCells: number;
  /** Water tiles covering the region, and the grid level they resolve water at. */
  waterTiles: TileRange;
  waterLevel: number;
  /** Land cells inside the region; null until its water data has loaded. */
  landCells: number | null;
  /** Unlocked cells inside the region (land only, once water is known). */
  unlockedCells: number;
};

/** Small regions get per-cell water; huge ones a coarser estimate. */
const MAX_REGION_WATER_TILES = 64;

export function regionWaterTiles(shape: Shape): TileRange {
  const b = shape.bbox;
  for (let z = WATER_TILE_MAX_ZOOM; ; z--) {
    const d = 2 ** (BASE_ZOOM - z);
    const range = {
      z,
      x0: Math.floor(b.minX / d),
      x1: Math.floor(b.maxX / d),
      y0: Math.floor(b.minY / d),
      y1: Math.floor(b.maxY / d),
    };
    if (z === 0 || tileCount(range) <= MAX_REGION_WATER_TILES) return range;
  }
}

export function hydrateRegion(rec: RegionRecord, unlocked: Iterable<number>): Region {
  const shape = shapeFromGeoJson(rec.geometry);
  const waterTiles = regionWaterTiles(shape);
  let count = 0;
  for (const key of unlocked) if (shapeContainsCell(shape, key)) count++;
  return {
    ...rec,
    shape,
    totalCells: shapeCellCount(shape),
    waterTiles,
    waterLevel: waterTiles.z + MASK_BITS,
    landCells: null,
    unlockedCells: count,
  };
}

/**
 * Switches a region to land-only scoring once its water tiles are loaded:
 * water inside the boundary no longer counts toward the total, and unlocked
 * water cells (ferries, bridges) no longer count as progress.
 */
export function applyWater(region: Region, unlocked: Iterable<number>, water: WaterLookup): void {
  const level = region.waterLevel;
  let waterCells = 0;
  const scanned = scanShape(region.shape, level, (row, start, end) => {
    for (let x = start; x < end; x++) if (water(level, x, row)) waterCells++;
  });
  if (!scanned) return;
  // Each water cell at a coarser level stands for many base cells.
  const perCell = 4 ** (BASE_ZOOM - level);
  region.landCells = Math.max(1, region.totalCells - waterCells * perCell);

  let count = 0;
  for (const key of unlocked) {
    if (shapeContainsCell(region.shape, key) && !isWaterCell(water, key, level)) count++;
  }
  region.unlockedCells = count;
}

/** Adds newly unlocked cells to a region's tally. Returns true if it changed. */
export function addCellsToRegion(region: Region, newKeys: number[], water?: WaterLookup): boolean {
  let added = 0;
  for (const key of newKeys) {
    if (!shapeContainsCell(region.shape, key)) continue;
    if (region.landCells !== null && water && isWaterCell(water, key, region.waterLevel)) continue;
    added++;
  }
  region.unlockedCells += added;
  return added > 0;
}

/** Cells that count toward 100%: land, or everything until water is known. */
export function scoredCells(region: Pick<Region, 'totalCells' | 'landCells'>): number {
  return region.landCells ?? region.totalCells;
}

export function completion(region: Pick<Region, 'totalCells' | 'landCells' | 'unlockedCells'>): number {
  return Math.min(1, region.unlockedCells / scoredCells(region));
}

/** Human-friendly percentage that still shows progress in huge regions. */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  if (pct === 0) return '0%';
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  // Countries can take a lifetime; show enough digits for progress to be visible.
  return `${pct.toPrecision(2)}%`;
}
