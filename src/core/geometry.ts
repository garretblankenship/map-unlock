import { scanRings } from './scanline';
import { type ShapeIndex, buildShapeIndex } from './shapeIndex';
import { BASE_ZOOM, type LatLng, keyX, keyY, latToY, lonToX, xToLon, yToLat } from './tiles';

/** GeoJSON geometry as returned by OpenStreetMap / Nominatim. */
export type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: string; coordinates: unknown };

/** Flat [x0, y0, x1, y1, ...] ring in base-zoom tile coordinates. */
export type Ring = Float64Array;

/** A polygon is an outer ring followed by any holes. */
export type Shape = {
  polygons: Ring[][];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export function isAreaGeometry(g: GeoJsonGeometry | null | undefined): boolean {
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon');
}

export function shapeFromGeoJson(g: GeoJsonGeometry): Shape {
  const polys: number[][][][] =
    g.type === 'Polygon'
      ? [g.coordinates as number[][][]]
      : g.type === 'MultiPolygon'
        ? (g.coordinates as number[][][][])
        : [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polygons = polys.map((rings) =>
    rings.map((ring) => {
      const out = new Float64Array(ring.length * 2);
      ring.forEach(([lon, lat], i) => {
        const x = lonToX(lon);
        const y = latToY(lat);
        out[i * 2] = x;
        out[i * 2 + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
      return out;
    }),
  );
  return { polygons, bbox: { minX, minY, maxX, maxY } };
}

function ringContains(ring: Ring, px: number, py: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The exact even-odd test against every ring. */
export function shapeContainsExact(shape: Shape, px: number, py: number): boolean {
  const b = shape.bbox;
  if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) return false;
  for (const [outer, ...holes] of shape.polygons) {
    if (ringContains(outer, px, py) && !holes.some((h) => ringContains(h, px, py))) return true;
  }
  return false;
}

/** Shapes with more edges than this get a grid index (built on first use). */
const INDEX_MIN_VERTICES = 64;
const indexes = new WeakMap<Shape, ShapeIndex | null>();

function indexFor(shape: Shape): ShapeIndex | null {
  let index = indexes.get(shape);
  if (index === undefined) {
    const vertices = shape.polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length / 2, 0), 0);
    index = vertices >= INDEX_MIN_VERTICES ? buildShapeIndex(shape.polygons, shape.bbox) : null;
    indexes.set(shape, index);
  }
  return index;
}

/**
 * Whether a point (in base-zoom grid units) is inside the shape. Big shapes
 * answer from a grid index, falling back to the exact test only near the
 * border; small ones are tested exactly. Results are the same either way.
 */
export function shapeContains(shape: Shape, px: number, py: number): boolean {
  const b = shape.bbox;
  if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) return false;
  const known = indexFor(shape)?.lookup(px, py);
  return known ?? shapeContainsExact(shape, px, py);
}

/** Whether the center of a base-zoom cell lies inside the shape. */
export function shapeContainsCell(shape: Shape, key: number): boolean {
  return shapeContains(shape, keyX(key) + 0.5, keyY(key) + 0.5);
}

function ringArea(ring: Ring): number {
  let sum = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  }
  return Math.abs(sum) / 2;
}

/**
 * Area of the shape measured in base-zoom cells. Because both the shape and
 * the cells live in the same Mercator projection, this approximates the
 * number of cells whose centers fall inside the shape.
 */
export function shapeAreaInCells(shape: Shape): number {
  let total = 0;
  for (const [outer, ...holes] of shape.polygons) {
    total += ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0);
  }
  return Math.max(1, Math.round(total));
}

/** Rows beyond which counting falls back to the area estimate. */
const MAX_SCAN_ROWS = 2_000_000;

/**
 * Calls onSpan(row, xStart, xEndExclusive) for each run of cells at `level`
 * whose centers are inside the shape, using the same inside test as
 * shapeContainsCell. Returns false (without scanning) if the shape is too
 * tall to scan at that level.
 */
export function scanShape(
  shape: Shape,
  level: number,
  onSpan: (row: number, xStart: number, xEnd: number) => void,
): boolean {
  const scale = 2 ** (level - BASE_ZOOM);
  if ((shape.bbox.maxY - shape.bbox.minY) * scale > MAX_SCAN_ROWS) return false;
  // Parts of a multipolygon don't overlap, so each can be filled on its own.
  for (const rings of shape.polygons) scanRings(rings, onSpan, scale);
  return true;
}

/**
 * Exact number of base cells whose centers are inside the shape (the same
 * test used when crediting unlocked cells), so unlocking every cell in a
 * region reaches exactly 100%.
 */
export function shapeCellCount(shape: Shape): number {
  let total = 0;
  const ok = scanShape(shape, BASE_ZOOM, (_row, start, end) => {
    total += end - start;
  });
  return ok ? Math.max(1, total) : shapeAreaInCells(shape);
}

/** Ring converted back to map coordinates, for drawing outlines. */
export function ringToLatLngs(ring: Ring): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    out.push({ latitude: yToLat(ring[i + 1], BASE_ZOOM), longitude: xToLon(ring[i], BASE_ZOOM) });
  }
  return out;
}

/** Outer rings of each polygon, which is all that's needed to draw a border. */
export function shapeOutlines(shape: Shape): LatLng[][] {
  return shape.polygons.map(([outer]) => ringToLatLngs(outer));
}

export function shapeBoundsLatLng(shape: Shape): { ne: LatLng; sw: LatLng } {
  const b = shape.bbox;
  return {
    ne: { latitude: yToLat(b.minY), longitude: xToLon(b.maxX) },
    sw: { latitude: yToLat(b.maxY), longitude: xToLon(b.minX) },
  };
}
