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
  /**
   * Walking, cycling, driving and trains all count. Faster than this
   * (≈250 km/h) is treated as flying or a GPS glitch and doesn't.
   */
  maxSpeedMps: 70,
  /**
   * Gaps longer than this aren't filled in, since we don't know the route
   * taken. Long enough to bridge sparse updates at highway speeds.
   */
  maxGapMeters: 1000,
  /**
   * ...and so are gaps in time longer than this, unless they're short: the
   * app was closed in between (without background exploring) and the way
   * from there to here, by tram or on foot, is unknown. Long enough for the
   * first fix after GPS wakes from low power.
   */
  maxGapSeconds: 180,
  shortGapMeters: 200,
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
 * plausible for ground travel, so sparse GPS updates still leave a
 * continuous trail.
 */
export function cellsForMove(prev: Fix | null, cur: Fix): number[] {
  const { radiusMeters, maxGapMeters, maxSpeedMps, maxGapSeconds, shortGapMeters } = REVEAL_SETTINGS;
  if (!prev) return cellsAround(cur.latitude, cur.longitude, radiusMeters);

  const dist = distanceMeters(prev, cur);
  const seconds = Math.max(1, (cur.timestamp - prev.timestamp) / 1000);
  if (dist > maxGapMeters || dist / seconds > maxSpeedMps || (seconds > maxGapSeconds && dist > shortGapMeters)) {
    return cellsAround(cur.latitude, cur.longitude, radiusMeters);
  }

  // The short way round, across the 180° meridian too.
  let dLon = cur.longitude - prev.longitude;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const steps = Math.max(1, Math.ceil(dist / (radiusMeters / 2)));
  const keys = new Set<number>();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lat = prev.latitude + (cur.latitude - prev.latitude) * t;
    const lon = wrapLongitude(prev.longitude + dLon * t);
    for (const k of cellsAround(lat, lon, radiusMeters)) keys.add(k);
  }
  return [...keys];
}

function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
