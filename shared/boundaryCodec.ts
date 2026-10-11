/**
 * Compact ring encoding shared by the boundary pipeline (which writes it)
 * and the app (which reads it). Coordinates are whole numbers of 1e-5
 * degrees (about 1 m), and each point after the first is stored as the
 * difference from the previous one, so most numbers are short:
 *   [lon0, lat0, dLon1, dLat1, dLon2, dLat2, ...]
 * This module has no imports so both sides can use it as is (shared/ is an
 * ES module package, which the pipeline needs when run directly by Node).
 */
export const COORD_SCALE = 1e5;

export function encodeRing(ring: [number, number][]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * COORD_SCALE);
    const y = Math.round(lat * COORD_SCALE);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

export function decodeRing(encoded: number[]): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    out.push([x / COORD_SCALE, y / COORD_SCALE]);
  }
  return out;
}
