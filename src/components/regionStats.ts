import { Region, completion, formatPercent, scoredCells } from '../core/regions';
import { BASE_ZOOM, cellSizeMeters, yToLat } from '../core/tiles';
import { UnitSystem, formatArea } from '../core/units';

/** Display strings for a region's progress. */
export function regionStats(r: Region, units: UnitSystem) {
  const midLat = yToLat((r.shape.bbox.minY + r.shape.bbox.maxY) / 2);
  const cellArea = cellSizeMeters(midLat, BASE_ZOOM) ** 2;
  const fraction = completion(r);
  return {
    fraction,
    percent: formatPercent(fraction),
    explored: formatArea(r.unlockedCells * cellArea, units),
    total: formatArea(scoredCells(r) * cellArea, units),
    /** Water hasn't loaded yet, so the total still includes it. */
    landPending: r.landCells === null,
  };
}
