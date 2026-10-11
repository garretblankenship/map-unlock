import { scanRings } from './scanline';

/**
 * Fast point-in-region tests for big regions. A coarse grid (at most
 * GRID_SIZE squares across) over the region's bounding box marks each square
 * as inside, outside, or on the border. A square no border edge passes
 * through is entirely inside or entirely outside, so most points are answered
 * by one array lookup; only points in border squares need the exact test.
 * Results are identical to the exact test.
 */
export type Rings = ArrayLike<number>[];
type Polygons = Rings[];

const GRID_SIZE = 256;
const OUTSIDE = 0;
const INSIDE = 1;
const BORDER = 2;

export type ShapeIndex = {
  /** true / false, or null when the point is in a border square and needs the exact test. */
  lookup(px: number, py: number): boolean | null;
};

export function buildShapeIndex(
  polygons: Polygons,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
): ShapeIndex {
  const span = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 1e-9);
  // Square size: a power of two, so the grid lines up with tiles.
  const size = 2 ** Math.ceil(Math.log2(span / GRID_SIZE));
  const gx0 = Math.floor(bbox.minX / size);
  const gy0 = Math.floor(bbox.minY / size);
  const w = Math.floor(bbox.maxX / size) - gx0 + 1;
  const h = Math.floor(bbox.maxY / size) - gy0 + 1;
  const grid = new Uint8Array(w * h).fill(OUTSIDE);

  // Squares whose centers are inside, by the same even-odd rule as the exact test.
  for (const rings of polygons) {
    scanRings(
      rings,
      (row, start, end) => {
        const y = row - gy0;
        if (y < 0 || y >= h) return;
        for (let x = Math.max(start - gx0, 0); x < Math.min(end - gx0, w); x++) grid[y * w + x] = INSIDE;
      },
      1 / size,
    );
  }

  // Squares the border passes through (Amanatides–Woo grid traversal).
  const mark = (cx: number, cy: number) => {
    const x = cx - gx0;
    const y = cy - gy0;
    if (x >= 0 && x < w && y >= 0 && y < h) grid[y * w + x] = BORDER;
  };
  for (const rings of polygons) {
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const x0 = ring[j * 2] / size;
        const y0 = ring[j * 2 + 1] / size;
        const x1 = ring[i * 2] / size;
        const y1 = ring[i * 2 + 1] / size;
        let cx = Math.floor(x0);
        let cy = Math.floor(y0);
        const ex = Math.floor(x1);
        const ey = Math.floor(y1);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const sx = Math.sign(dx);
        const sy = Math.sign(dy);
        let tMaxX = dx !== 0 ? ((sx > 0 ? cx + 1 : cx) - x0) / dx : Infinity;
        let tMaxY = dy !== 0 ? ((sy > 0 ? cy + 1 : cy) - y0) / dy : Infinity;
        const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
        const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
        mark(cx, cy);
        for (let steps = Math.abs(ex - cx) + Math.abs(ey - cy) + 2; steps > 0 && (cx !== ex || cy !== ey); steps--) {
          if (tMaxX === tMaxY) {
            // Through a corner: mark both neighbours to be safe.
            mark(cx + sx, cy);
            mark(cx, cy + sy);
            cx += sx;
            cy += sy;
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
          } else if (tMaxX < tMaxY) {
            cx += sx;
            tMaxX += tDeltaX;
          } else {
            cy += sy;
            tMaxY += tDeltaY;
          }
          mark(cx, cy);
        }
      }
    }
  }

  return {
    lookup(px, py) {
      const x = Math.floor(px / size) - gx0;
      const y = Math.floor(py / size) - gy0;
      if (x < 0 || x >= w || y < 0 || y >= h) return false;
      const state = grid[y * w + x];
      return state === BORDER ? null : state === INSIDE;
    },
  };
}
