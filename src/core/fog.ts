import { BASE_ZOOM, LatLng, cellKey, clampLat, keyX, keyY, latToY, lonToX, xToLon, yToLat } from './tiles';

/**
 * Builds the gray "fog" overlay for the part of the map on screen.
 *
 * The visible window is rasterized into a grid of unlocked/locked cells, the
 * outlines of the unlocked areas are traced, and the result is turned into
 * polygons-with-holes: one big fog sheet with holes where you've explored,
 * plus extra fog patches for any unexplored islands inside explored areas.
 *
 * When zoomed out the grid is coarsened (a coarse cell counts as unlocked if
 * any of its sub-cells are), so the work stays bounded at every zoom.
 */

export type Viewport = { north: number; south: number; east: number; west: number };

export type FogPolygon = { outer: LatLng[]; holes: LatLng[][] };

export type FogResult = { level: number; polygons: FogPolygon[] };

export const FOG_SETTINGS = {
  /** Upper bound on grid cells across the (padded) window width. */
  maxCellsAcross: 160,
  /** Extra margin around the screen so small pans don't reveal un-fogged edges. */
  padding: 0.5,
};

/** Coarsest-necessary zoom level so the padded viewport fits the cell budget. */
export function chooseLevel(v: Viewport, maxCellsAcross = FOG_SETTINGS.maxCellsAcross): number {
  const w = padded(v);
  const width = lonToX(w.east) - lonToX(w.west);
  const height = latToY(w.south) - latToY(w.north);
  let level = BASE_ZOOM;
  while (level > 0 && Math.max(width, height / 2) / 2 ** (BASE_ZOOM - level) > maxCellsAcross) {
    level--;
  }
  return level;
}

function padded(v: Viewport): Viewport {
  const lonSpan = Math.min(360, Math.max(0, v.east - v.west));
  const latSpan = Math.max(0, v.north - v.south);
  const p = FOG_SETTINGS.padding;
  return {
    north: clampLat(v.north + latSpan * p),
    south: clampLat(v.south - latSpan * p),
    east: Math.min(180, v.east + lonSpan * p),
    west: Math.max(-180, v.west - lonSpan * p),
  };
}

// Directions on the grid, with y growing downward: east, south, west, north.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

type GridRing = { pts: number[]; area: number; sampleX: number; sampleY: number };

/**
 * Traces the boundaries of the unlocked (1) cells in a grid. Outer boundaries
 * come back with positive area, boundaries around locked islands negative.
 * Grid border cells must be locked so every ring is closed.
 */
export function traceRings(grid: Uint8Array, gw: number, gh: number): GridRing[] {
  const vw = gw + 1;
  const out = new Uint8Array(vw * (gh + 1));
  const used = new Uint8Array(vw * (gh + 1));
  const at = (i: number, j: number) => grid[j * gw + i];

  // Each unlocked cell contributes the sides that face a locked neighbor,
  // oriented clockwise on screen so the unlocked cell is on the right.
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) out[j * vw + i] |= 1 << 0;
      if (!at(i + 1, j)) out[j * vw + i + 1] |= 1 << 1;
      if (!at(i, j + 1)) out[(j + 1) * vw + i + 1] |= 1 << 2;
      if (!at(i - 1, j)) out[(j + 1) * vw + i] |= 1 << 3;
    }
  }

  const rings: GridRing[] = [];
  for (let v0 = 0; v0 < out.length; v0++) {
    for (let d0 = 0; d0 < 4; d0++) {
      if (!(out[v0] & (1 << d0)) || used[v0] & (1 << d0)) continue;

      const pts: number[] = [];
      let v = v0;
      let d = d0;
      for (;;) {
        used[v] |= 1 << d;
        pts.push(v % vw, Math.floor(v / vw));
        v += DX[d] + DY[d] * vw;
        // Prefer turning right: at a vertex where two unlocked cells touch
        // only diagonally, this keeps them as separate outlines.
        const right = (d + 1) % 4;
        const left = (d + 3) % 4;
        const next = out[v] & (1 << right) ? right : out[v] & (1 << d) ? d : left;
        if (used[v] & (1 << next)) break;
        d = next;
      }

      const simplified = dropCollinear(pts);
      // The unlocked cell to the right of the first edge lies inside this ring.
      const vx = v0 % vw;
      const vy = Math.floor(v0 / vw);
      const cell = [
        [vx, vy],
        [vx - 1, vy],
        [vx - 1, vy - 1],
        [vx, vy - 1],
      ][d0];
      rings.push({
        pts: simplified,
        area: signedArea(simplified),
        sampleX: cell[0] + 0.5,
        sampleY: cell[1] + 0.5,
      });
    }
  }
  return rings;
}

function dropCollinear(pts: number[]): number[] {
  const n = pts.length / 2;
  const res: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n;
    const q = (k + 1) % n;
    const ax = pts[k * 2] - pts[p * 2];
    const ay = pts[k * 2 + 1] - pts[p * 2 + 1];
    const bx = pts[q * 2] - pts[k * 2];
    const by = pts[q * 2 + 1] - pts[k * 2 + 1];
    if (ax * by - ay * bx !== 0) res.push(pts[k * 2], pts[k * 2 + 1]);
  }
  return res;
}

function signedArea(pts: number[]): number {
  let s = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return s / 2;
}

function ringContains(pts: number[], px: number, py: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const yj = pts[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Fog polygons in grid coordinates. The first polygon is the full window
 * (border included) with holes cut for top-level explored areas.
 */
export function fogFromGrid(
  grid: Uint8Array,
  gw: number,
  gh: number,
): { outer: number[]; holes: number[][] }[] {
  const rings = traceRings(grid, gw, gh);
  const explored = rings.filter((r) => r.area > 0);
  const islands = rings.filter((r) => r.area < 0);

  const sheet = { outer: [0, 0, gw, 0, gw, gh, 0, gh], holes: [] as number[][] };
  const patches = islands.map((r) => ({ outer: r.pts, holes: [] as number[][], size: -r.area }));

  for (const r of explored) {
    // Cut this explored area out of the innermost fog that surrounds it.
    let container: { holes: number[][] } = sheet;
    let best = Infinity;
    for (const p of patches) {
      if (p.size < best && ringContains(p.outer, r.sampleX, r.sampleY)) {
        container = p;
        best = p.size;
      }
    }
    container.holes.push(r.pts);
  }
  return [sheet, ...patches.map(({ outer, holes }) => ({ outer, holes }))];
}

/** The grid level and cell range the fog is computed over for a viewport. */
export function fogWindow(viewport: Viewport): { level: number; x0: number; x1: number; y0: number; y1: number } {
  const level = chooseLevel(viewport);
  const w = padded(viewport);
  const max = 2 ** level - 1;
  return {
    level,
    x0: Math.max(0, Math.floor(lonToX(w.west, level))),
    x1: Math.min(max, Math.floor(lonToX(w.east, level))),
    y0: Math.max(0, Math.floor(latToY(w.north, level))),
    y1: Math.min(max, Math.floor(latToY(w.south, level))),
  };
}

/**
 * Fog for a viewport. `cellsAtLevel(level)` returns the unlocked cells at
 * that zoom level (see ExplorationStore, which caches these). Cells that
 * `isWater` reports as water are never fogged.
 */
export function fogForViewport(
  viewport: Viewport,
  cellsAtLevel: (level: number) => Set<number>,
  isWater?: (level: number, x: number, y: number) => boolean,
): FogResult {
  const { level, x0, x1, y0, y1 } = fogWindow(viewport);

  // One cell of always-locked border around the window.
  const gw = x1 - x0 + 3;
  const gh = y1 - y0 + 3;
  const grid = new Uint8Array(gw * gh);
  const cells = cellsAtLevel(level);
  if (cells.size > 0) {
    if (cells.size < (gw - 2) * (gh - 2)) {
      for (const key of cells) {
        const x = keyX(key);
        const y = keyY(key);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) grid[(y - y0 + 1) * gw + (x - x0 + 1)] = 1;
      }
    } else {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (cells.has(cellKey(x, y))) grid[(y - y0 + 1) * gw + (x - x0 + 1)] = 1;
        }
      }
    }
  }
  if (isWater) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y - y0 + 1) * gw + (x - x0 + 1);
        if (!grid[i] && isWater(level, x, y)) grid[i] = 1;
      }
    }
  }

  const toLatLngs = (pts: number[]): LatLng[] => {
    const res: LatLng[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      res.push({
        latitude: yToLat(pts[i + 1] + y0 - 1, level),
        longitude: Math.max(-180, Math.min(180, xToLon(pts[i] + x0 - 1, level))),
      });
    }
    return res;
  };

  const polygons = fogFromGrid(grid, gw, gh).map((p) => ({
    outer: toLatLngs(p.outer),
    holes: p.holes.map(toLatLngs),
  }));
  return { level, polygons };
}
