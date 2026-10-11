import { PbfWriter } from 'pbf';
import { describe, expect, it } from 'vitest';

import { fogForViewport } from './fog';
import { shapeContainsCell } from './geometry';
import { addCellsToRegion, applyWater, completion, hydrateRegion } from './regions';
import { MASK_SIZE, WaterMask, isWaterCell, makeWaterLookup, maskFromTile, tilesForCells } from './water';
import { BASE_ZOOM, cellKey, keyX, latToY, lonToX, xToLon } from './tiles';

type TestFeature = { rings: [number, number][][]; props?: Record<string, string | number> };

/** Encodes a minimal Mapbox Vector Tile with polygon features in one layer. */
function encodeTile(layerName: string, features: TestFeature[], extent = 4096): Uint8Array {
  const keys: string[] = [];
  const values: (string | number)[] = [];
  const index = <T>(arr: T[], v: T) => (arr.includes(v) ? arr.indexOf(v) : arr.push(v) - 1);
  const zigzag = (n: number) => (n << 1) ^ (n >> 31);

  const encoded = features.map((f) => {
    const tags: number[] = [];
    for (const [k, v] of Object.entries(f.props ?? {})) tags.push(index(keys, k), index(values, v));
    const geometry: number[] = [];
    let cx = 0;
    let cy = 0;
    for (const ring of f.rings) {
      const [first, ...rest] = ring;
      geometry.push((1 << 3) | 1, zigzag(first[0] - cx), zigzag(first[1] - cy));
      [cx, cy] = first;
      geometry.push((rest.length << 3) | 2);
      for (const [x, y] of rest) {
        geometry.push(zigzag(x - cx), zigzag(y - cy));
        [cx, cy] = [x, y];
      }
      geometry.push((1 << 3) | 7);
    }
    return { tags, geometry };
  });

  const pbf = new PbfWriter();
  pbf.writeMessage(
    3,
    (_: null, p: PbfWriter) => {
      p.writeVarintField(15, 2);
      p.writeStringField(1, layerName);
      for (const f of encoded) {
        p.writeMessage(
          2,
          (_f: null, q: PbfWriter) => {
            q.writePackedVarint(2, f.tags);
            q.writeVarintField(3, 3);
            q.writePackedVarint(4, f.geometry);
          },
          null,
        );
      }
      for (const k of keys) p.writeStringField(3, k);
      for (const v of values) {
        p.writeMessage(
          4,
          (_v: null, q: PbfWriter) => (typeof v === 'string' ? q.writeStringField(1, v) : q.writeVarintField(5, v)),
          null,
        );
      }
      p.writeVarintField(5, extent);
    },
    null,
  );
  return pbf.finish();
}

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe('water masks', () => {
  it('rasterizes water polygons onto the game grid', () => {
    const mask = maskFromTile(
      encodeTile('water', [
        // Left half of the tile is ocean.
        { rings: [rect(0, 0, 2048, 4096)], props: { class: 'ocean' } },
        // A lake with an island in the middle.
        { rings: [rect(2560, 512, 3584, 1536), rect(2944, 896, 3200, 1152)], props: { class: 'lake' } },
        // Swimming pools and seasonal water stay fogged.
        { rings: [rect(2560, 3072, 3584, 3584)], props: { class: 'swimming_pool' } },
        { rings: [rect(2560, 2048, 3584, 2560)], props: { class: 'lake', intermittent: 1 } },
      ]),
    )!;
    const at = (x: number, y: number) => mask[y * MASK_SIZE + x];
    expect(at(0, 0)).toBe(1);
    expect(at(31, 63)).toBe(1);
    expect(at(32, 0)).toBe(0);
    expect(at(44, 12)).toBe(1); // lake
    expect(at(48, 16)).toBe(0); // island
    expect(at(44, 52)).toBe(0); // pool
    expect(at(44, 36)).toBe(0); // intermittent
    expect(mask.reduce((a, b) => a + b, 0)).toBe(32 * 64 + 16 * 16 - 4 * 4);
  });

  it('handles ocean polygons that extend past the tile edge', () => {
    const mask = maskFromTile(encodeTile('water', [{ rings: [rect(-128, -128, 4224, 4224)] }]))!;
    expect(mask.every((v) => v === 1)).toBe(true);
  });

  it('treats tiles without water as all land', () => {
    expect(maskFromTile(encodeTile('water', []))).toBeNull();
    expect(maskFromTile(encodeTile('landuse', [{ rings: [rect(0, 0, 4096, 4096)] }]))).toBeNull();
  });

  it('looks up water at fine and coarse levels', () => {
    const left = new Uint8Array(MASK_SIZE * MASK_SIZE).map((_, i) => ((i % MASK_SIZE) < 32 ? 1 : 0));
    const lookup = makeWaterLookup((z, x, y) => (z === 0 && x === 0 && y === 0 ? left : undefined));
    expect(lookup(6, 0, 10)).toBe(true);
    expect(lookup(6, 40, 10)).toBe(false);
    expect(lookup(1, 0, 0)).toBe(true); // the west half of the world
    expect(lookup(1, 1, 0)).toBe(false);
    expect(lookup(7, 0, 0)).toBe(false); // tile not loaded → land
    expect(tilesForCells(20, 64, 200, 0, 63)).toEqual({ z: 14, x0: 1, x1: 3, y0: 0, y1: 0 });
  });
});

describe('land-only regions', () => {
  // A region straddling a coastline: everything west of `coast` is sea.
  const lat = -33.86;
  const lon = 151.2;
  const d = 0.004;
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]],
  };
  const coastX = Math.floor(lonToX(lon));
  const sea = makeWaterLookup((z, tx, ty) => {
    if (z !== 14) return undefined;
    const m: WaterMask = new Uint8Array(MASK_SIZE * MASK_SIZE);
    for (let i = 0; i < m.length; i++) if (tx * MASK_SIZE + (i % MASK_SIZE) < coastX) m[i] = 1;
    return m;
  });
  const rec = { id: 'R2', name: 'Harbourside', displayName: 'Harbourside', level: 'neighbourhood' as const, geometry, createdAt: 0 };

  function cellsIn(region: ReturnType<typeof hydrateRegion>) {
    const out: number[] = [];
    const b = region.shape.bbox;
    for (let x = Math.floor(b.minX); x <= b.maxX; x++) {
      for (let y = Math.floor(b.minY); y <= b.maxY; y++) if (shapeContainsCell(region.shape, cellKey(x, y))) out.push(cellKey(x, y));
    }
    return out;
  }

  it('excludes water from the total and from progress', () => {
    const region = hydrateRegion(rec, []);
    expect(region.waterLevel).toBe(BASE_ZOOM);
    applyWater(region, [], sea);
    const all = cellsIn(region);
    const land = all.filter((k) => keyX(k) >= coastX);
    expect(region.landCells).toBe(land.length);
    expect(region.landCells! / region.totalCells).toBeGreaterThan(0.45);
    expect(region.landCells! / region.totalCells).toBeLessThan(0.55);

    // Unlocking only the sea (say, on a ferry) makes no progress...
    addCellsToRegion(region, all.filter((k) => keyX(k) < coastX), sea);
    expect(completion(region)).toBe(0);
    // ...and unlocking all the land reaches exactly 100%.
    addCellsToRegion(region, land, sea);
    expect(completion(region)).toBe(1);
  });

  it('agrees whether water is applied before or after exploring', () => {
    const region = hydrateRegion(rec, []);
    const land = cellsIn(region).filter((k) => keyX(k) >= coastX).slice(0, 100);
    const ferry = cellsIn(region).filter((k) => keyX(k) < coastX).slice(0, 50);
    const later = hydrateRegion(rec, [...land, ...ferry]);
    applyWater(later, [...land, ...ferry], sea);
    applyWater(region, [], sea);
    addCellsToRegion(region, [...land, ...ferry], sea);
    expect(later.unlockedCells).toBe(100);
    expect(region.unlockedCells).toBe(100);
  });

  it('never fogs water, even where nobody has been', () => {
    const v = { north: lat + 0.002, south: lat - 0.002, east: lon + 0.002, west: lon - 0.002 };
    const fog = fogForViewport(v, () => new Set(), sea);
    // The fog's only sheet now ends at the coastline instead of covering the sea.
    const lons = fog.polygons[0].holes.flat().map((p) => p.longitude);
    expect(fog.polygons[0].holes).toHaveLength(1);
    expect(Math.max(...lons)).toBeCloseTo(xToLon(coastX), 6);
  });

  it('marks unlocked water cells as water', () => {
    expect(isWaterCell(sea, cellKey(coastX - 1, Math.floor(latToY(lat))), BASE_ZOOM)).toBe(true);
    expect(isWaterCell(sea, cellKey(coastX, Math.floor(latToY(lat))), BASE_ZOOM)).toBe(false);
  });
});
