import Constants from 'expo-constants';

import { type BoundaryMeta, type TileRegion, isSupportedMeta, regionsContaining, tilesAt, tilesOver } from '../core/boundaryLookup';
import type { Bounds } from '../core/mapgeo';
import { REGION_LEVELS, type RegionRecord } from '../core/regions';
import { loadBoundaryFile, saveBoundaryFile } from './db';
import { HttpError, NetworkError, fetchWithTimeout } from './net';

/**
 * Region boundaries from the static files built by pipeline/, hosted at
 * BOUNDARIES_URL (set when building; see app.config.ts). Every file is
 * cached on the phone, so places you've been, or saved for offline use,
 * resolve without signal.
 */
const BASE_URL = ((Constants.expoConfig?.extra?.boundariesUrl as string | undefined) ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 30_000;
/** Caps for saving an area offline, so a huge area can't download thousands of files. */
const MAX_PREFETCH_TILES = 300;
const MAX_PREFETCH_REGIONS = 600;

export const boundaryFilesConfigured = BASE_URL !== '';

function parse<T>(body: string): T | undefined {
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * A file's JSON, from the phone's cache or the network. null means the
 * server has no such file; that's remembered too (an empty tile), except
 * for files that must exist, so fixing the hosting fixes the app. Only
 * valid JSON is cached: a Wi-Fi sign-in page answering instead of the
 * server is treated like no signal, and tried again later.
 */
function getJson<T>(path: string, rememberMissing = true): Promise<T | null> {
  const url = `${BASE_URL}/${path}`;
  // Saving an area and looking up a place in it ask for the same files.
  let job = inflight.get(url) as Promise<T | null> | undefined;
  if (!job) {
    job = fetchJson<T>(url, path, rememberMissing).finally(() => inflight.delete(url));
    inflight.set(url, job);
  }
  return job;
}

async function fetchJson<T>(url: string, path: string, rememberMissing: boolean): Promise<T | null> {
  const cached = await loadBoundaryFile(url);
  if (cached === null) return null;
  if (cached !== undefined) {
    const value = parse<T>(cached);
    if (value !== undefined) return value;
    // A bad copy (cached by an earlier version): fetch it again.
  }
  const body = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, TIMEOUT_MS, async (res) => {
    if (res.status === 404) return null;
    if (!res.ok) throw new HttpError(`Boundary file ${path} failed (${res.status})`, res.status);
    return res.text();
  });
  if (body === null) {
    if (rememberMissing) await saveBoundaryFile(url, null);
    return null;
  }
  const value = parse<T>(body);
  if (value === undefined) throw new NetworkError(`Boundary file ${path} isn't valid JSON (a Wi-Fi sign-in page?)`);
  await saveBoundaryFile(url, body);
  return value;
}

let meta: Promise<BoundaryMeta> | null = null;

function getMeta(): Promise<BoundaryMeta> {
  meta ??= getJson<unknown>('meta.json', false)
    .then((m) => {
      if (!isSupportedMeta(m)) throw new Error('Boundary files are a newer format than this app understands.');
      return m;
    })
    .catch((e) => {
      meta = null;
      throw e;
    });
  return meta;
}

async function tileRegions(path: string): Promise<TileRegion[]> {
  return (await getJson<{ regions: TileRegion[] }>(path))?.regions ?? [];
}

type RegionFile = Omit<RegionRecord, 'createdAt'>;

async function regionRecord(id: string): Promise<RegionRecord | null> {
  const r = await getJson<RegionFile>(`regions/${id}.json`);
  if (!r || !(REGION_LEVELS as readonly string[]).includes(r.level)) return null;
  return { ...r, createdAt: Date.now() };
}

/**
 * Every region containing a point (one per level, plus any parks). If the
 * connection fails partway, what was found so far comes back with the error.
 */
export async function boundaryRegionsAt(lat: number, lon: number): Promise<{ regions: RegionRecord[]; error?: unknown }> {
  const regions: RegionRecord[] = [];
  try {
    const m = await getMeta();
    const tiles = await Promise.all(tilesAt(m, lat, lon).map((t) => tileRegions(t.path)));
    for (const hit of regionsContaining(tiles, lat, lon)) {
      const rec = await regionRecord(hit.id);
      if (rec) regions.push(rec);
    }
    return { regions };
  } catch (error) {
    return { regions, error };
  }
}

/**
 * Downloads the boundary files for an area ahead of a trip, so the regions
 * in it are found without signal. Rejects if anything couldn't be fetched;
 * call again later to finish (cached files aren't fetched twice).
 */
export async function prefetchBoundaries(bounds: Bounds): Promise<void> {
  if (!boundaryFilesConfigured) return;
  const m = await getMeta();
  const ids = new Set<string>();
  for (const t of tilesOver(m, bounds).slice(0, MAX_PREFETCH_TILES)) {
    for (const r of await tileRegions(t.path)) ids.add(r.id);
  }
  for (const id of [...ids].slice(0, MAX_PREFETCH_REGIONS)) await regionRecord(id);
}
