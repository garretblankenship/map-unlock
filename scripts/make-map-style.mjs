// Builds assets/map/style.json from OpenFreeMap's "Liberty" style.
//
// The stock style loads tiles through a TileJSON whose tile URLs carry a
// weekly version (planet/20261004_.../{z}/{x}/{y}.pbf). Offline map
// downloads are stored by URL, so once the version moves on, a downloaded
// area no longer matches and shows blank without signal. This copy points
// straight at OpenFreeMap's version-less `planet/latest` tiles instead, so
// downloaded areas keep working across data updates.
//
// The app bundles this file for the map itself, and offline downloads
// fetch the same file from MAP_STYLE_URL (see src/services/mapStyle.ts).
// Re-run after changing it:  node scripts/make-map-style.mjs
import { writeFileSync } from 'node:fs';

const res = await fetch('https://tiles.openfreemap.org/styles/liberty');
if (!res.ok) throw new Error(`Style download failed (${res.status})`);
const style = await res.json();

style.name = 'Open World Life (OpenFreeMap Liberty)';
style.sources.openmaptiles = {
  type: 'vector',
  tiles: ['https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 14,
  attribution:
    '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
};

writeFileSync(new URL('../assets/map/style.json', import.meta.url), JSON.stringify(style, null, 2) + '\n');
console.log(`Wrote assets/map/style.json (${style.layers.length} layers)`);
