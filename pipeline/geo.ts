/**
 * Geometry helpers for the boundary pipeline. Coordinates are [lon, lat]
 * pairs; rings are closed (first point repeated at the end) as in GeoJSON.
 */
export type Position = [number, number];
export type Ring = Position[];
export type Polygon = Ring[];
export type BBox = [west: number, south: number, east: number, north: number];

const EARTH_RADIUS = 6_371_008.8;
const RAD = Math.PI / 180;

export function polygonsOf(geometry: { type: string; coordinates: unknown }): Polygon[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as Polygon];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Polygon[];
  return [];
}

export function bboxOf(polygons: Polygon[]): BBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygons) {
    for (const [x, y] of poly[0] ?? []) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

/** Area of a ring in km², ignoring winding (spherical excess approximation). */
export function ringAreaKm2(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs((sum * EARTH_RADIUS * EARTH_RADIUS) / 2) / 1e6;
}

/** Land area of polygons in km²: outer rings minus holes. */
export function areaKm2(polygons: Polygon[]): number {
  let a = 0;
  for (const [outer, ...holes] of polygons) {
    a += ringAreaKm2(outer);
    for (const h of holes) a -= ringAreaKm2(h);
  }
  return Math.max(0, a);
}

/** Even-odd test against any number of rings (holes included). */
export function pointInRings(rings: Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * A point guaranteed to be inside the largest polygon (a centroid can fall
 * outside a crescent or an L shape). Scans across the middle of the shape
 * and takes the midpoint of the widest inside stretch.
 */
export function interiorPoint(polygons: Polygon[]): Position | null {
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const p of polygons) {
    const a = ringAreaKm2(p[0]);
    if (a > bestArea) [best, bestArea] = [p, a];
  }
  if (!best) return null;
  const [, s, , n] = bboxOf([best]);
  for (const f of [0.5, 0.37, 0.63, 0.25, 0.75, 0.1, 0.9]) {
    const y = s + (n - s) * f;
    const xs: number[] = [];
    for (const ring of best) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
    }
    xs.sort((a, b) => a - b);
    let widest = 0;
    let point: Position | null = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > widest) [widest, point] = [xs[i + 1] - xs[i], [(xs[i] + xs[i + 1]) / 2, y]];
    }
    if (point) return point;
  }
  return null;
}

/** Douglas–Peucker simplification of a closed ring, tolerance in meters. Never fewer than 4 points. */
export function simplifyRing(ring: Ring, toleranceMeters: number): Ring {
  if (ring.length <= 4 || toleranceMeters <= 0) return ring;
  // Local equirectangular projection to meters, good enough at ring scale.
  const lat0 = ring[0][1] * RAD;
  const kx = EARTH_RADIUS * RAD * Math.cos(lat0);
  const ky = EARTH_RADIUS * RAD;
  const xs = ring.map((p) => p[0] * kx);
  const ys = ring.map((p) => p[1] * ky);
  const keep = new Uint8Array(ring.length);
  const last = ring.length - 1;
  keep[0] = keep[last] = 1;
  // A closed ring's endpoints coincide, so also anchor the point farthest from the start.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < last; i++) {
    const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2;
    if (d > farD) [far, farD] = [i, d];
  }
  keep[far] = 1;
  const tol2 = toleranceMeters * toleranceMeters;
  const stack: [number, number][] = [
    [0, far],
    [far, last],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len2 = dx * dx + dy * dy;
    let idx = -1;
    let max = tol2;
    for (let i = a + 1; i < b; i++) {
      let t = len2 ? ((xs[i] - xs[a]) * dx + (ys[i] - ys[a]) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = (xs[i] - xs[a] - t * dx) ** 2 + (ys[i] - ys[a] - t * dy) ** 2;
      if (d > max) [idx, max] = [i, d];
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/** Simplifies every ring, dropping rings (islands, holes) smaller than the tolerance allows. */
export function simplifyPolygons(polygons: Polygon[], toleranceMeters: number): Polygon[] {
  const minKm2 = (toleranceMeters * toleranceMeters * 4) / 1e6;
  const out: Polygon[] = [];
  for (const [outer, ...holes] of polygons) {
    if (ringAreaKm2(outer) < minKm2 && polygons.length > 1) continue;
    const o = simplifyRing(outer, toleranceMeters);
    const hs = holes.filter((h) => ringAreaKm2(h) >= minKm2).map((h) => simplifyRing(h, toleranceMeters));
    out.push([o, ...hs]);
  }
  return out.length ? out : polygons;
}

/** Rounds coordinates to ~1 m (5 decimal places) to keep files small. */
export function roundPolygons(polygons: Polygon[]): Polygon[] {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return polygons.map((p) => p.map((ring) => ring.map(([x, y]): Position => [r(x), r(y)])));
}

/**
 * Clips a ring to a box (Sutherland–Hodgman). The result may run along the
 * box edge where the shape leaves and re-enters, which is harmless for the
 * point-in-polygon tests the tiles are used for.
 */
export function clipRing(ring: Ring, [w, s, e, n]: BBox): Ring {
  const edges: [(p: Position) => boolean, (a: Position, b: Position) => Position][] = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ];
  let pts = ring.slice(0, -1);
  for (const [inside, cross] of edges) {
    if (pts.length === 0) break;
    const next: Position[] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) {
        if (!inside(prev)) next.push(cross(prev, cur));
        next.push(cur);
      } else if (inside(prev)) {
        next.push(cross(prev, cur));
      }
    }
    pts = next;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : [];
}
