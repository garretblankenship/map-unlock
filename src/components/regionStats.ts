import { Region, completion, formatArea, formatPercent } from '../core/regions';
import { BASE_ZOOM, cellSizeMeters, yToLat } from '../core/tiles';

/** Display strings for a region's progress. */
export function regionStats(r: Region) {
  const midLat = yToLat((r.shape.bbox.minY + r.shape.bbox.maxY) / 2);
  const cellArea = cellSizeMeters(midLat, BASE_ZOOM) ** 2;
  const fraction = completion(r);
  return {
    fraction,
    percent: formatPercent(fraction),
    explored: formatArea(r.unlockedCells * cellArea),
    total: formatArea(r.totalCells * cellArea),
  };
}
