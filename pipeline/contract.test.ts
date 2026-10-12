/**
 * The pipeline and the app must agree on the boundary file format. This
 * builds real files from a tiny synthetic map with the pipeline, serves them
 * over HTTP, and looks places up with the app's own code, online and then
 * offline from the phone's cache.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { build } from './build.ts';

const state = vi.hoisted(() => ({ url: '', online: true, portal: false, cache: new Map<string, string | null>(), requests: 0 }));

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { boundariesUrl: state.url } } } }));
vi.mock('expo-network', () => ({}));
vi.mock('expo-localization', () => ({ getLocales: () => [] }));
vi.mock('../src/services/db', () => ({
  loadBoundaryFile: async (url: string) => state.cache.get(url),
  saveBoundaryFile: async (url: string, body: string | null) => void state.cache.set(url, body),
}));
vi.mock('../src/services/net', async (orig) => {
  const real = await orig<typeof import('../src/services/net')>();
  return {
    ...real,
    fetchWithTimeout: (...args: Parameters<typeof real.fetchWithTimeout>) => {
      if (!state.online) throw new real.NetworkError('No connection');
      state.requests++;
      return real.fetchWithTimeout(...args);
    },
  };
});

const box = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const feature = (id: number, tags: Record<string, string>, coords: number[][][]) =>
  JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: coords }, properties: { '@type': 'relation', '@id': id, ...tags } });

let server: Server;
let out: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'boundaries-'));
  const input = join(dir, 'areas.geojsonseq');
  writeFileSync(
    input,
    [
      feature(1, { boundary: 'administrative', admin_level: '2', name: 'Testland', 'ISO3166-1:alpha2': 'TL' }, box(5, 45, 7, 47)),
      feature(2, { boundary: 'administrative', admin_level: '4', name: 'North State' }, box(5.5, 45.5, 6.8, 46.8)),
      feature(3, { boundary: 'administrative', admin_level: '6', name: 'Pine County' }, box(5.9, 45.9, 6.4, 46.4)),
      feature(4, { boundary: 'administrative', admin_level: '8', name: 'Rivertown' }, box(6.0, 46.0, 6.1, 46.1)),
      feature(5, { boundary: 'administrative', admin_level: '10', name: 'Old Quarter' }, box(6.02, 46.02, 6.04, 46.04)),
      feature(6, { boundary: 'national_park', name: 'Peaks National Park' }, box(6.2, 46.2, 6.35, 46.35)),
      feature(7, { boundary: 'administrative', admin_level: '5', name: 'Not A Region' }, box(5.6, 45.6, 6.6, 46.6)),
    ]
      .map((l) => `\u001e${l}`)
      .join('\n'),
  );
  out = join(dir, 'out');
  await build(input, out);

  server = createServer((req, res) => {
    // A Wi-Fi network that answers everything with its sign-in page.
    if (state.portal) return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html>Sign in</html>');
    try {
      const body = readFileSync(join(out, decodeURIComponent(req.url ?? '').replace(/^\/+/, '')));
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  state.url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('boundary files: pipeline → app', () => {
  it('finds every region containing a point, one per level', async () => {
    const { boundaryRegionsAt } = await import('../src/services/boundaryFiles');
    const { regions, error } = await boundaryRegionsAt(46.03, 6.03);
    expect(error).toBeUndefined();
    expect(regions.map((r) => `${r.level}:${r.name}`).sort()).toEqual([
      'city:Rivertown',
      'country:Testland',
      'county:Pine County',
      'neighbourhood:Old Quarter',
      'state:North State',
    ]);
    const town = regions.find((r) => r.name === 'Rivertown')!;
    expect(town.id).toBe('R4');
    expect(town.displayName).toBe('Rivertown, Testland');
    expect(town.geometry.type).toBe('MultiPolygon');
  });

  it('finds parks, and nothing outside every region', async () => {
    const { boundaryRegionsAt } = await import('../src/services/boundaryFiles');
    const park = await boundaryRegionsAt(46.3, 6.3);
    expect(park.regions.map((r) => r.name)).toContain('Peaks National Park');
    expect((await boundaryRegionsAt(10, 10)).regions).toEqual([]);
  });

  it('works offline for a saved area', async () => {
    const { boundaryRegionsAt, prefetchBoundaries } = await import('../src/services/boundaryFiles');
    await prefetchBoundaries([6.2, 46.2, 6.35, 46.35]);
    state.online = false;
    const before = state.requests;
    const { regions, error } = await boundaryRegionsAt(46.25, 6.25);
    expect(error).toBeUndefined();
    expect(regions.map((r) => r.name)).toContain('Peaks National Park');
    expect(state.requests).toBe(before);
    // Somewhere never cached fails cleanly, to be retried later.
    const elsewhere = await boundaryRegionsAt(45.2, 5.2);
    expect(elsewhere.error).toBeDefined();
    state.online = true;
  });

  it("doesn't keep a Wi-Fi sign-in page in place of a boundary file", async () => {
    const { boundaryRegionsAt } = await import('../src/services/boundaryFiles');
    const { NetworkError } = await import('../src/services/net');
    state.portal = true;
    const cached = state.cache.size;
    const behind = await boundaryRegionsAt(45.1, 6.9);
    expect(behind.error).toBeInstanceOf(NetworkError); // retried later, quietly
    expect(state.cache.size).toBe(cached);
    state.portal = false;
    const after = await boundaryRegionsAt(45.1, 6.9);
    expect(after.error).toBeUndefined();
    expect(after.regions.map((r) => r.name)).toEqual(['Testland']);
  });
});
