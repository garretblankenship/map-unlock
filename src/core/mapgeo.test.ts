import { describe, expect, it } from 'vitest';

import { fogFromGrid, fogForViewport } from './fog';
import { boundsOfPoints, fogToGeoJSON, linesToGeoJSON, samplePoints, tileCountForBounds, tileRangeForBounds } from './mapgeo';
import { BASE_ZOOM, cellAt, parentKey } from './tiles';

const area = (ring: number[][]) => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
};

describe('fogToGeoJSON', () => {
  const square = (cx: number, cy: number, r: number, cw = false) => {
    const pts = [
      { longitude: cx - r, latitude: cy - r },
      { longitude: cx + r, latitude: cy - r },
      { longitude: cx + r, latitude: cy + r },
      { longitude: cx - r, latitude: cy + r },
    ];
    return cw ? pts.reverse() : pts;
  };

  it('closes rings and winds outers counterclockwise, holes clockwise', () => {
    // Deliberately wrong input windings.
    const f = fogToGeoJSON([{ outer: square(0, 0, 10, true), holes: [square(1, 1, 2), square(-3, -3, 1)] }]);
    const [poly] = f.geometry.coordinates;
    expect(poly).toHaveLength(3);
    for (const ring of poly) expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(area(poly[0])).toBeGreaterThan(0);
    expect(area(poly[1])).toBeLessThan(0);
    expect(area(poly[2])).toBeLessThan(0);
  });

  it('uses [longitude, latitude] order', () => {
    const f = fogToGeoJSON([{ outer: [{ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 3 }, { latitude: 2, longitude: 3 }], holes: [] }]);
    expect(f.geometry.coordinates[0][0][0]).toEqual([2, 1]);
  });

  it('turns real fog with explored holes into valid polygons', () => {
    const view = { north: 47.62, south: 47.6, east: -122.32, west: -122.35 };
    const c = cellAt(47.61, -122.335);
    const fog = fogForViewport(view, (level) => new Set([parentKey(c, BASE_ZOOM - level)]));
    const geo = fogToGeoJSON(fog.polygons);
    const holes = geo.geometry.coordinates.flatMap((p) => p.slice(1));
    expect(holes.length).toBeGreaterThan(0);
    for (const p of geo.geometry.coordinates) {
      expect(area(p[0])).toBeGreaterThan(0);
      for (const h of p.slice(1)) expect(area(h)).toBeLessThan(0);
    }
  });

  it('keeps islands inside explored areas as their own polygons', () => {
    // 5x5 grid: explored ring around an unexplored center cell.
    const grid = new Uint8Array(25);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) grid[y * 5 + x] = 1;
    grid[2 * 5 + 2] = 0;
    const rings = fogFromGrid(grid, 5, 5);
    expect(rings.length).toBe(2);
  });
});

describe('tiles and bounds', () => {
  it('counts the tile pyramid', () => {
    expect(tileCountForBounds([-180, -85, 180, 85], 0, 2)).toBe(1 + 4 + 16);
    const r = tileRangeForBounds([-121.8, 46.8, -121.7, 46.9], 14);
    expect(tileCountForBounds([-121.8, 46.8, -121.7, 46.9], 14, 14)).toBe((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1));
  });

  it('finds bounds and sample points', () => {
    const b = boundsOfPoints([{ latitude: 1, longitude: 5 }, { latitude: -2, longitude: 7 }])!;
    expect(b).toEqual([5, -2, 7, 1]);
    expect(samplePoints(b)[0]).toEqual({ latitude: -0.5, longitude: 6 });
    expect(boundsOfPoints([])).toBeNull();
  });

  it('builds line features', () => {
    const l = linesToGeoJSON([[{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }]]);
    expect(l.geometry.coordinates).toEqual([[[2, 1], [4, 3]]]);
  });
});

describe('download estimates', () => {
  it('sizes a hiking area and refuses a whole country', async () => {
    const { estimateDownload, formatBytes } = await import('./mapgeo');
    const rainier = estimateDownload([-121.95, 46.75, -121.55, 46.98]);
    expect(rainier.tooBig).toBe(false);
    expect(rainier.mapTiles).toBeGreaterThan(100);
    expect(estimateDownload([-125, 24, -66, 49]).tooBig).toBe(true);
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(4_200_000)).toBe('4.2 MB');
    expect(formatBytes(250_000_000)).toBe('250 MB');
  });
});
