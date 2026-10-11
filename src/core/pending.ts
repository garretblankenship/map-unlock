import { LatLng, distanceMeters } from './tiles';

/**
 * Places visited without a usable connection, waiting for their boundaries
 * to be looked up. Points are spaced out so a long offline hike queues a
 * handful of lookups, not thousands.
 */
export const PENDING_SETTINGS = {
  /** A new point is only queued this far from every queued one. */
  minSpacingMeters: 1000,
  /** Oldest points are dropped beyond this (≈1000 km of offline travel). */
  maxPoints: 1000,
};

export function addPendingPlace(list: LatLng[], p: LatLng): LatLng[] {
  const { minSpacingMeters, maxPoints } = PENDING_SETTINGS;
  if (list.some((q) => distanceMeters(q, p) < minSpacingMeters)) return list;
  const next = [...list, { latitude: p.latitude, longitude: p.longitude }];
  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
}

export function removePendingPlace(list: LatLng[], p: LatLng): LatLng[] {
  return list.filter((q) => q.latitude !== p.latitude || q.longitude !== p.longitude);
}
