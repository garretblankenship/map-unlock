import { describe, expect, it } from 'vitest';

import { fogForViewport, fogFromGrid, traceRings } from './fog';
import { shapeAreaInCells, shapeCellCount, shapeContainsCell, shapeFromGeoJson } from './geometry';
import { REVEAL_SETTINGS, cellsAround, cellsForMove, isUsableFix } from './reveal';
import { completion, formatPercent, hydrateRegion } from './regions';
import {
  BASE_ZOOM,
  cellAt,
  cellKey,
  cellSizeMeters,
  keyX,
  keyY,
  latToY,
  lonToX,
  parentKey,
  xToLon,
  yToLat,
} from './tiles';

const SYDNEY = { latitude: -33.8688, longitude: 151.2093 };

describe('tiles', () => {
  it('round-trips coordinates', () => {
    expect(xToLon(lonToX(SYDNEY.longitude))).toBeCloseTo(SYDNEY.longitude, 9);
    expect(yToLat(latToY(SYDNEY.latitude))).toBeCloseTo(SYDNEY.latitude, 9);
  });

  it('packs and unpacks keys', () => {
    const k = cellKey(1048575, 654321);
    expect(keyX(k)).toBe(1048575);
    expect(keyY(k)).toBe(654321);
    expect(parentKey(cellKey(10, 11), 1)).toBe(cellKey(5, 5));
  });

  it('has ~32m cells in Sydney', () => {
    expect(cellSizeMeters(SYDNEY.latitude)).toBeGreaterThan(30);
    expect(cellSizeMeters(SYDNEY.latitude)).toBeLessThan(34);
  });
});

describe('reveal', () => {
  it('unlocks roughly a circle of the configured radius', () => {
    const r = 50;
    const cells = new Set(cellsAround(SYDNEY.latitude, SYDNEY.longitude, r));
    const expected = (Math.PI * r * r) / cellSizeMeters(SYDNEY.latitude) ** 2;
    expect(cells.size).toBeGreaterThan(expected * 0.8);
    expect(cells.size).toBeLessThan(expected * 1.2);
    expect(cells.has(cellAt(SYDNEY.latitude, SYDNEY.longitude))).toBe(true);
  });

  it('fills in the path between nearby fixes', () => {
    const a = { ...SYDNEY, timestamp: 0 };
    // ~200m east, walked in 2.5 minutes.
    const b = { latitude: SYDNEY.latitude, longitude: SYDNEY.longitude + 0.00216, timestamp: 150_000 };
    const cells = new Set(cellsForMove(a, b));
    const mid = cellAt(SYDNEY.latitude, SYDNEY.longitude + 0.00108);
    expect(cells.has(mid)).toBe(true);
  });

  it('fills in the road between fixes when driving', () => {
    const a = { ...SYDNEY, timestamp: 0 };
    // ~800m east in 30 seconds (≈96 km/h).
    const b = { latitude: SYDNEY.latitude, longitude: SYDNEY.longitude + 0.00864, timestamp: 30_000 };
    const mid = cellAt(SYDNEY.latitude, SYDNEY.longitude + 0.00432);
    expect(new Set(cellsForMove(a, b)).has(mid)).toBe(true);
    expect(isUsableFix({ ...b, speed: 27 })).toBe(true);
  });

  it('ignores flight-speed movement', () => {
    const a = { ...SYDNEY, timestamp: 0 };
    // ~800m east in 3 seconds (≈960 km/h).
    const b = { latitude: SYDNEY.latitude, longitude: SYDNEY.longitude + 0.00864, timestamp: 3_000 };
    const mid = cellAt(SYDNEY.latitude, SYDNEY.longitude + 0.00432);
    expect(new Set(cellsForMove(a, b)).has(mid)).toBe(false);
    expect(isUsableFix({ ...b, speed: 250 })).toBe(false);
    expect(REVEAL_SETTINGS.maxSpeedMps).toBeLessThan(100);
  });
});

/** Rasterizes fog polygons back onto the grid to check they cover exactly the locked cells. */
function foggedCells(grid: Uint8Array, gw: number, gh: number): Uint8Array {
  const inside = (pts: number[], px: number, py: number) => {
    let c = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi, xj, yj] = [pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const polys = fogFromGrid(grid, gw, gh);
  const out = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const px = i + 0.5;
      const py = j + 0.5;
      const covered = polys.filter((p) => inside(p.outer, px, py) && !p.holes.some((h) => inside(h, px, py)));
      // Fog sheets never overlap, so a cell is covered at most once.
      expect(covered.length).toBeLessThanOrEqual(1);
      out[j * gw + i] = covered.length;
    }
  }
  return out;
}

function gridFrom(rows: string[]): { grid: Uint8Array; gw: number; gh: number } {
  const gh = rows.length + 2;
  const gw = rows[0].length + 2;
  const grid = new Uint8Array(gw * gh);
  rows.forEach((row, j) => [...row].forEach((ch, i) => (grid[(j + 1) * gw + i + 1] = ch === '#' ? 1 : 0)));
  return { grid, gw, gh };
}

describe('fog tracing', () => {
  it('traces a single cell', () => {
    const { grid, gw, gh } = gridFrom(['#']);
    const rings = traceRings(grid, gw, gh);
    expect(rings).toHaveLength(1);
    expect(rings[0].area).toBe(1);
    expect(rings[0].pts).toHaveLength(8);
  });

  it('keeps diagonally touching cells as separate outlines', () => {
    const { grid, gw, gh } = gridFrom(['#.', '.#']);
    const rings = traceRings(grid, gw, gh);
    expect(rings.map((r) => r.area).sort()).toEqual([1, 1]);
  });

  it('finds unexplored islands and explored areas nested inside them', () => {
    const { grid, gw, gh } = gridFrom(['#####', '#...#', '#.#.#', '#...#', '#####']);
    const polys = fogFromGrid(grid, gw, gh);
    // Window sheet with one hole, plus an island patch with the center cell cut out.
    expect(polys).toHaveLength(2);
    expect(polys[0].holes).toHaveLength(1);
    expect(polys[1].holes).toHaveLength(1);
  });

  it('covers exactly the locked cells for random exploration patterns', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let trial = 0; trial < 200; trial++) {
      const rows = Array.from({ length: 4 + (trial % 9) }, () =>
        Array.from({ length: 4 + (trial % 7) }, () => (rand() < 0.5 ? '#' : '.')).join(''),
      );
      const { grid, gw, gh } = gridFrom(rows);
      const fog = foggedCells(grid, gw, gh);
      for (let k = 0; k < grid.length; k++) expect(fog[k]).toBe(grid[k] ? 0 : 1);
    }
  });
});

describe('fogForViewport', () => {
  it('cuts a hole where the user has walked and coarsens when zoomed out', () => {
    const unlocked = new Set(cellsAround(SYDNEY.latitude, SYDNEY.longitude, 50));
    const levels = (level: number) => new Set([...unlocked].map((k) => parentKey(k, BASE_ZOOM - level)));

    const near = fogForViewport(
      { north: SYDNEY.latitude + 0.002, south: SYDNEY.latitude - 0.002, east: SYDNEY.longitude + 0.002, west: SYDNEY.longitude - 0.002 },
      levels,
    );
    expect(near.level).toBe(BASE_ZOOM);
    expect(near.polygons[0].holes).toHaveLength(1);

    const far = fogForViewport({ north: -33, south: -35, east: 152, west: 150 }, levels);
    expect(far.level).toBeLessThan(14);
    expect(far.polygons[0].holes).toHaveLength(1);
  });
});

describe('regions', () => {
  // A ~1km square around Sydney CBD.
  const d = 0.0045;
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [[
      [SYDNEY.longitude - d, SYDNEY.latitude - d],
      [SYDNEY.longitude + d, SYDNEY.latitude - d],
      [SYDNEY.longitude + d, SYDNEY.latitude + d],
      [SYDNEY.longitude - d, SYDNEY.latitude + d],
      [SYDNEY.longitude - d, SYDNEY.latitude - d],
    ]],
  };

  it('counts cells consistently with cell membership', () => {
    const shape = shapeFromGeoJson(geometry);
    const b = shape.bbox;
    let counted = 0;
    for (let x = Math.floor(b.minX); x <= b.maxX; x++) {
      for (let y = Math.floor(b.minY); y <= b.maxY; y++) if (shapeContainsCell(shape, cellKey(x, y))) counted++;
    }
    expect(shapeCellCount(shape)).toBe(counted);
    // The area estimate (used for enormous regions) is close but subject to edge effects.
    expect(Math.abs(counted - shapeAreaInCells(shape)) / counted).toBeLessThan(0.05);
  });

  it('computes completion from unlocked cells inside the boundary', () => {
    const shape = shapeFromGeoJson(geometry);
    const all: number[] = [];
    for (let x = Math.floor(shape.bbox.minX) - 5; x <= shape.bbox.maxX + 5; x++) {
      for (let y = Math.floor(shape.bbox.minY) - 5; y <= shape.bbox.maxY + 5; y++) all.push(cellKey(x, y));
    }
    const rec = { id: 'R1', name: 'Test', displayName: 'Test', level: 'city' as const, geometry, createdAt: 0 };
    expect(completion(hydrateRegion(rec, []))).toBe(0);
    // Unlocking everything (including cells outside the border) is exactly 100%.
    expect(completion(hydrateRegion(rec, all))).toBe(1);
  });

  it('counts cells in shapes with holes and multiple parts', () => {
    const square = (cx: number, cy: number, r: number) => [
      [cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r],
    ];
    const { latitude: la, longitude: lo } = SYDNEY;
    const shape = shapeFromGeoJson({
      type: 'MultiPolygon',
      coordinates: [[square(lo, la, 0.004), square(lo, la, 0.0015)], [square(lo + 0.01, la, 0.001)]],
    });
    let counted = 0;
    for (let x = Math.floor(shape.bbox.minX); x <= shape.bbox.maxX; x++) {
      for (let y = Math.floor(shape.bbox.minY); y <= shape.bbox.maxY; y++) if (shapeContainsCell(shape, cellKey(x, y))) counted++;
    }
    expect(shapeCellCount(shape)).toBe(counted);
  });

  it('formats tiny percentages so progress is visible', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(0.000012)).toBe('0.0012%');
  });
});
