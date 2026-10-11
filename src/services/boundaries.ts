import { GeoJsonGeometry, isAreaGeometry } from '../core/geometry';
import { RegionLevel, RegionRecord } from '../core/regions';
import { HttpError, fetchWithTimeout } from './net';

/**
 * Administrative boundaries come from OpenStreetMap via the public Nominatim
 * API. Its usage policy allows at most one request per second and requires
 * an identifying User-Agent, so all requests go through a small queue.
 * For a production launch, point NOMINATIM_URL at a self-hosted instance or
 * a commercial geocoder with polygon support.
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'OpenWorldLife/1.0 (https://github.com/garretblankenship/map-unlock)';
const MIN_INTERVAL_MS = 1100;
/** Boundary responses are 1–100 KB; allow for a weak signal. */
const TIMEOUT_MS = 30_000;

/** Reverse-geocode zoom per level, and how much to simplify each boundary (degrees). */
const LOOKUPS: { zoom: number; threshold: number }[] = [
  { zoom: 14, threshold: 0.00005 },
  { zoom: 10, threshold: 0.0002 },
  { zoom: 5, threshold: 0.002 },
  { zoom: 3, threshold: 0.01 },
];

type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  place_rank?: number;
  geojson?: GeoJsonGeometry;
  error?: string;
};

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function request<T>(path: string): Promise<T> {
  const run = async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fetchWithTimeout(
      `${NOMINATIM_URL}${path}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      TIMEOUT_MS,
      async (res) => {
        if (!res.ok) throw new HttpError(`Boundary lookup failed (${res.status})`, res.status);
        return (await res.json()) as T;
      },
    );
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

/** OSM place_rank → our level buckets. */
export function levelForRank(rank: number): RegionLevel {
  if (rank <= 5) return 'country';
  if (rank <= 10) return 'state';
  if (rank <= 17) return 'city';
  return 'neighbourhood';
}

function toRecord(p: NominatimPlace): RegionRecord | null {
  if (!p.osm_type || p.osm_id == null || !isAreaGeometry(p.geojson)) return null;
  return {
    id: `${p.osm_type[0].toUpperCase()}${p.osm_id}`,
    name: p.name || p.display_name?.split(',')[0] || 'Unnamed area',
    displayName: p.display_name ?? p.name ?? '',
    level: levelForRank(p.place_rank ?? 30),
    geometry: p.geojson!,
    createdAt: Date.now(),
  };
}

/**
 * Every administrative area containing a point: neighbourhood, city, state
 * and country (whichever exist there). Results are de-duplicated, since in
 * small places one boundary can answer several zoom levels.
 *
 * If the connection drops partway, the areas found so far are returned along
 * with the error, so a weak signal still makes progress.
 */
export async function regionsAt(lat: number, lon: number): Promise<{ regions: RegionRecord[]; error?: unknown }> {
  const found = new Map<string, RegionRecord>();
  for (const { zoom, threshold } of LOOKUPS) {
    let place: NominatimPlace;
    try {
      place = await request<NominatimPlace>(
        `/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&polygon_geojson=1&polygon_threshold=${threshold}`,
      );
    } catch (error) {
      return { regions: [...found.values()], error };
    }
    const rec = place && !place.error ? toRecord(place) : null;
    if (rec && !found.has(rec.id)) found.set(rec.id, rec);
  }
  return { regions: [...found.values()] };
}

/** Search for a place by name, keeping only results that have a boundary. */
export async function searchRegions(query: string): Promise<RegionRecord[]> {
  const places = await request<NominatimPlace[]>(
    `/search?format=jsonv2&q=${encodeURIComponent(query)}&polygon_geojson=1&polygon_threshold=0.001&limit=8`,
  );
  return places.map(toRecord).filter((r): r is RegionRecord => r !== null);
}
