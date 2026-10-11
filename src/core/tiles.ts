/**
 * The world is divided into a Web Mercator grid (the same grid used by map
 * tiles). Exploration is tracked at BASE_ZOOM, where each cell is roughly
 * 38m wide at the equator and smaller toward the poles (~32m in Sydney).
 *
 * Cells at a zoom level are addressed by integer (x, y) and packed into a
 * single number so they can live in a Set<number>.
 */

export const BASE_ZOOM = 20;

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const MAX_LAT = 85.05112878;

export type LatLng = { latitude: number; longitude: number };

export function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/** Fractional tile x for a longitude at zoom z. */
export function lonToX(lon: number, z: number = BASE_ZOOM): number {
  return ((lon + 180) / 360) * 2 ** z;
}

/** Fractional tile y for a latitude at zoom z (y grows southward). */
export function latToY(lat: number, z: number = BASE_ZOOM): number {
  const rad = (clampLat(lat) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function xToLon(x: number, z: number = BASE_ZOOM): number {
  return (x / 2 ** z) * 360 - 180;
}

export function yToLat(y: number, z: number = BASE_ZOOM): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Ground width of one cell at zoom z and latitude lat, in meters. */
export function cellSizeMeters(lat: number, z: number = BASE_ZOOM): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** z;
}

// 2^25 leaves room for zoom levels up to 25 while keeping keys below 2^53.
const KEY_STRIDE = 2 ** 25;

export function cellKey(x: number, y: number): number {
  return x * KEY_STRIDE + y;
}

export function keyX(key: number): number {
  return Math.floor(key / KEY_STRIDE);
}

export function keyY(key: number): number {
  return key % KEY_STRIDE;
}

/** Key of the ancestor cell `levelsUp` zoom levels above the given cell. */
export function parentKey(key: number, levelsUp: number): number {
  if (levelsUp === 0) return key;
  const d = 2 ** levelsUp;
  return cellKey(Math.floor(keyX(key) / d), Math.floor(keyY(key) / d));
}

export function cellAt(lat: number, lon: number): number {
  return cellKey(Math.floor(lonToX(lon)), Math.floor(latToY(lat)));
}

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
