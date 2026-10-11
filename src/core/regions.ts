import { GeoJsonGeometry, Shape, shapeCellCount, shapeContainsCell, shapeFromGeoJson } from './geometry';

/** Administrative levels we track, from smallest to largest. */
export const REGION_LEVELS = ['neighbourhood', 'city', 'state', 'country'] as const;
export type RegionLevel = (typeof REGION_LEVELS)[number];

export const LEVEL_LABELS: Record<RegionLevel, string> = {
  neighbourhood: 'Neighbourhoods',
  city: 'Cities',
  state: 'States & provinces',
  country: 'Countries',
};

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
  /** Number of base cells inside the region (its area in cells). */
  totalCells: number;
  /** Number of unlocked base cells inside the region. */
  unlockedCells: number;
};

export function hydrateRegion(rec: RegionRecord, unlocked: Iterable<number>): Region {
  const shape = shapeFromGeoJson(rec.geometry);
  let count = 0;
  for (const key of unlocked) if (shapeContainsCell(shape, key)) count++;
  return { ...rec, shape, totalCells: shapeCellCount(shape), unlockedCells: count };
}

/** Adds newly unlocked cells to a region's tally. Returns true if it changed. */
export function addCellsToRegion(region: Region, newKeys: number[]): boolean {
  let added = 0;
  for (const key of newKeys) if (shapeContainsCell(region.shape, key)) added++;
  region.unlockedCells += added;
  return added > 0;
}

export function completion(region: Pick<Region, 'totalCells' | 'unlockedCells'>): number {
  return Math.min(1, region.unlockedCells / region.totalCells);
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

export function formatArea(m2: number): string {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(m2 >= 1e8 ? 0 : 2)} km²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}
