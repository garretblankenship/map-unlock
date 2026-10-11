import { BASE_ZOOM, cellKey, cellSizeMeters, distanceMeters, latToY, lonToX } from './tiles';

export type Fix = {
  latitude: number;
  longitude: number;
  /** Milliseconds since epoch. */
  timestamp: number;
  /** Horizontal accuracy in meters, if the OS reported one. */
  accuracy?: number | null;
  /** Speed in m/s, if the OS reported one. */
  speed?: number | null;
};

export const REVEAL_SETTINGS = {
  /** Everything within this distance of where you've been gets unlocked. */
  radiusMeters: 50,
  /** Fixes less accurate than this are ignored so GPS drift can't unlock areas. */
  maxAccuracyMeters: 40,
  /** Faster than this (≈25 km/h) is treated as driving/transit and doesn't count. */
  maxSpeedMps: 7,
  /** Gaps longer than this aren't filled in, since we don't know the route taken. */
  maxGapMeters: 250,
};

/** All base-zoom cells whose centers lie within `radiusMeters` of the point. */
export function cellsAround(lat: number, lon: number, radiusMeters: number): number[] {
  const fx = lonToX(lon);
  const fy = latToY(lat);
  const r = radiusMeters / cellSizeMeters(lat, BASE_ZOOM);
  const out: number[] = [];
  const max = 2 ** BASE_ZOOM;
  for (let x = Math.floor(fx - r); x <= Math.floor(fx + r); x++) {
    for (let y = Math.floor(fy - r); y <= Math.floor(fy + r); y++) {
      const dx = x + 0.5 - fx;
      const dy = y + 0.5 - fy;
      if (dx * dx + dy * dy <= r * r) out.push(cellKey(((x % max) + max) % max, y));
    }
  }
  // Always unlock the cell you're standing in, even with a tiny radius.
  out.push(cellKey(Math.floor(fx), Math.floor(fy)));
  return out;
}

export function isUsableFix(fix: Fix): boolean {
  if (fix.accuracy != null && fix.accuracy > REVEAL_SETTINGS.maxAccuracyMeters) return false;
  if (fix.speed != null && fix.speed > REVEAL_SETTINGS.maxSpeedMps) return false;
  return true;
}

/**
 * Cells unlocked by moving from `prev` to `cur`. The straight line between
 * the two fixes is filled in when the gap is short and the implied speed
 * plausible, so sparse GPS updates still leave a continuous trail.
 */
export function cellsForMove(prev: Fix | null, cur: Fix): number[] {
  const { radiusMeters, maxGapMeters, maxSpeedMps } = REVEAL_SETTINGS;
  if (!prev) return cellsAround(cur.latitude, cur.longitude, radiusMeters);

  const dist = distanceMeters(prev, cur);
  const seconds = Math.max(1, (cur.timestamp - prev.timestamp) / 1000);
  if (dist > maxGapMeters || dist / seconds > maxSpeedMps) {
    return cellsAround(cur.latitude, cur.longitude, radiusMeters);
  }

  const steps = Math.max(1, Math.ceil(dist / (radiusMeters / 2)));
  const keys = new Set<number>();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lat = prev.latitude + (cur.latitude - prev.latitude) * t;
    const lon = prev.longitude + (cur.longitude - prev.longitude) * t;
    for (const k of cellsAround(lat, lon, radiusMeters)) keys.add(k);
  }
  return [...keys];
}
