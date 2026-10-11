import type { Feature, MultiLineString, MultiPolygon } from 'geojson';

import type { FogPolygon, Viewport } from './fog';
import type { LatLng } from './tiles';

/**
 * Conversions between the game's geometry and what the map renderer
 * (MapLibre) consumes: GeoJSON with [longitude, latitude] positions and
 * [west, south, east, north] bounds.
 */

export type Bounds = [west: number, south: number, east: number, north: number];
type Position = [number, number];

export function viewportFromBounds([west, south, east, north]: Bounds): Viewport {
  return { west, south, east, north };
}

export function boundsFromViewport(v: Viewport): Bounds {
  return [v.west, v.south, v.east, v.north];
}

/** Twice the signed area of a ring; positive when counterclockwise. */
function signedArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a;
}

/**
 * A closed GeoJSON ring wound the requested way. The renderer tells holes
 * from outer rings by winding, so a hole wound like its outer ring would be
 * filled in with fog instead of cut out.
 */
function toRing(points: LatLng[], counterclockwise: boolean): Position[] {
  const ring: Position[] = points.map((p) => [p.longitude, p.latitude]);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (signedArea(ring) > 0 !== counterclockwise) ring.reverse();
  return ring;
}

/** Fog sheet as one MultiPolygon: outer rings counterclockwise, holes clockwise (RFC 7946). */
export function fogToGeoJSON(polygons: FogPolygon[]): Feature<MultiPolygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: polygons
        .filter((p) => p.outer.length >= 3)
        .map((p) => [toRing(p.outer, true), ...p.holes.filter((h) => h.length >= 3).map((h) => toRing(h, false))]),
    },
  };
}

export function linesToGeoJSON(lines: LatLng[][]): Feature<MultiLineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: lines.map((line) => line.map((p): Position => [p.longitude, p.latitude])),
    },
  };
}

const MAX_LAT = 85.05112878;

function tileX(lon: number, z: number): number {
  return Math.min(2 ** z - 1, Math.max(0, Math.floor(((lon + 180) / 360) * 2 ** z)));
}

function tileY(lat: number, z: number): number {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  return Math.min(2 ** z - 1, Math.max(0, y));
}

/** The x/y tile ranges covering some bounds at one zoom. */
export function tileRangeForBounds([west, south, east, north]: Bounds, z: number) {
  return { z, x0: tileX(west, z), x1: tileX(east, z), y0: tileY(north, z), y1: tileY(south, z) };
}

/** Number of map tiles in a zoom pyramid over some bounds. */
export function tileCountForBounds(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let n = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRangeForBounds(bounds, z);
    n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  }
  return n;
}

/** Bounds of a set of points, or null if there are none. */
export function boundsOfPoints(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    w = Math.min(w, p.longitude);
    e = Math.max(e, p.longitude);
    s = Math.min(s, p.latitude);
    n = Math.max(n, p.latitude);
  }
  return [w, s, e, n];
}

/** Center plus the middle of each quarter: enough to find the areas a region spans. */
export function samplePoints([west, south, east, north]: Bounds): LatLng[] {
  const at = (fx: number, fy: number): LatLng => ({
    longitude: west + (east - west) * fx,
    latitude: south + (north - south) * fy,
  });
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
}

/** Offline downloads cover the map's vector tiles, which stop at zoom 14 (closer zooms reuse them). */
export const OFFLINE_ZOOM = { min: 0, max: 14 };
/** Water masks are fetched for the zooms the fog uses when zoomed in on an area. */
export const OFFLINE_WATER_ZOOM = { min: 8, max: 14 };
/** Downloads larger than this are refused; zoom in to save a smaller area. */
export const MAX_OFFLINE_TILES = 20_000;

/**
 * Rough size of an offline download. Tiles vary from ~3 KB (wilderness) to
 * ~400 KB (downtown), so this is only a guide; real sizes show as it runs.
 */
export function estimateDownload(bounds: Bounds): { mapTiles: number; waterTiles: number; bytes: number; tooBig: boolean } {
  const mapTiles = tileCountForBounds(bounds, OFFLINE_ZOOM.min, OFFLINE_ZOOM.max);
  const waterTiles = tileCountForBounds(bounds, OFFLINE_WATER_ZOOM.min, OFFLINE_WATER_ZOOM.max);
  // Map tiles plus the same vector tiles again for water, at ~30 KB each.
  const bytes = (mapTiles + waterTiles) * 30_000;
  return { mapTiles, waterTiles, bytes, tooBig: mapTiles > MAX_OFFLINE_TILES };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}
