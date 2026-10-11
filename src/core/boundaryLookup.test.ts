import { describe, expect, it } from 'vitest';

import { encodeRing } from '../../shared/boundaryCodec';
import { BoundaryMeta, TileRegion, isSupportedMeta, regionsContaining, tilesAt, tilesOver } from './boundaryLookup';

const square = (cx: number, cy: number, r: number): number[] =>
  encodeRing([
    [cx - r, cy - r],
    [cx + r, cy - r],
    [cx + r, cy + r],
    [cx - r, cy + r],
    [cx - r, cy - r],
  ]);

const region = (id: string, level: string, area: number, r: number): TileRegion => ({
  id,
  name: id,
  level,
  area,
  rings: [square(6.13, 49.61, r)],
});

const meta: BoundaryMeta = {
  version: 1,
  groups: { local: { zoom: 11, levels: [] }, mid: { zoom: 8, levels: [] }, wide: { zoom: 5, levels: [] } },
};

describe('boundary lookup', () => {
  it('checks the format version', () => {
    expect(isSupportedMeta(meta)).toBe(true);
    expect(isSupportedMeta({ ...meta, version: 2 })).toBe(false);
    expect(isSupportedMeta(null)).toBe(false);
  });

  it('picks one tile per group for a point, more for an area', () => {
    const at = tilesAt(meta, 49.61, 6.13);
    expect(at.map((t) => t.path)).toEqual([
      'tiles/local/11/1058/698.json',
      'tiles/mid/8/132/87.json',
      'tiles/wide/5/16/10.json',
    ]);
    expect(tilesOver(meta, [5.9, 49.4, 6.6, 50.2]).length).toBeGreaterThan(3);
  });

  it('finds the containing regions, smallest per level, all parks', () => {
    const tiles = [
      [region('Borough', 'neighbourhood', 10, 0.05), region('District', 'neighbourhood', 2, 0.01)],
      [region('City', 'city', 50, 0.1), region('Far', 'city', 1, 0.001)],
      [region('Forest', 'park', 500, 0.2), region('Wilderness', 'park', 80, 0.15), region('Odd', 'river', 1, 1)],
    ];
    // "Far" is tiny but doesn't contain the point after shifting it away.
    tiles[1][1].rings = [square(7, 50, 0.001)];
    const found = regionsContaining(tiles, 49.61, 6.13).map((r) => r.id);
    expect(found.sort()).toEqual(['City', 'District', 'Forest', 'Wilderness']);
  });

  it('respects holes', () => {
    const donut: TileRegion = { ...region('Donut', 'city', 5, 0.1), rings: [square(6.13, 49.61, 0.1), square(6.13, 49.61, 0.01)] };
    expect(regionsContaining([[donut]], 49.61, 6.13)).toEqual([]);
    expect(regionsContaining([[donut]], 49.61, 6.18)).toHaveLength(1);
  });
});
