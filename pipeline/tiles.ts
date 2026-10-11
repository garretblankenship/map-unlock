import type { BBox } from './geo.ts';

/** Web Mercator tile maths, matching the map's and the app's tiles. */
const MAX_LAT = 85.05112878;

export function tileX(lon: number, z: number): number {
  return Math.min(2 ** z - 1, Math.max(0, Math.floor(((lon + 180) / 360) * 2 ** z)));
}

export function tileY(lat: number, z: number): number {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return Math.min(2 ** z - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)));
}

/** A tile's bounds in degrees. */
export function tileBBox(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** Every tile at zoom z overlapping a box. */
export function* tilesFor([w, s, e, n]: BBox, z: number): Generator<[number, number]> {
  for (let x = tileX(w, z); x <= tileX(e, z); x++) {
    for (let y = tileY(n, z); y <= tileY(s, z); y++) yield [x, y];
  }
}
