// Builds the map styles in assets/map/ from OpenFreeMap's styles:
//   node scripts/make-map-style.mjs liberty   -> style.json       (light)
//   node scripts/make-map-style.mjs dark      -> style-dark.json  (dark mode)
//
// The stock styles load tiles through a TileJSON whose tile URLs carry a
// weekly version (planet/20261004_.../{z}/{x}/{y}.pbf). Offline map
// downloads are stored by URL, so once the version moves on, a downloaded
// area no longer matches and shows blank without signal. These copies point
// straight at OpenFreeMap's version-less `planet/latest` tiles instead, so
// downloaded areas keep working across data updates.
//
// The app bundles both files. Offline downloads fetch style.json from
// MAP_STYLE_URL (see src/services/mapStyle.ts), so if you rebuild the light
// style, host the new file at a new URL. The dark style uses the same tiles,
// sprites and fonts (a subset), so downloads made with the light style cover
// it too.
import { writeFileSync } from 'node:fs';

const STYLES = {
  liberty: { file: 'style.json', name: 'Open World Life (OpenFreeMap Liberty)' },
  dark: { file: 'style-dark.json', name: 'Open World Life (OpenFreeMap Dark)' },
};

const which = process.argv[2];
const target = STYLES[which];
if (!target) {
  console.error(`Usage: node scripts/make-map-style.mjs <${Object.keys(STYLES).join('|')}>`);
  process.exit(1);
}

const res = await fetch(`https://tiles.openfreemap.org/styles/${which}`);
if (!res.ok) throw new Error(`Style download failed (${res.status})`);
const style = await res.json();

style.name = target.name;
style.sources.openmaptiles = {
  type: 'vector',
  tiles: ['https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 14,
  attribution:
    '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
};

writeFileSync(new URL(`../assets/map/${target.file}`, import.meta.url), JSON.stringify(style, null, 2) + '\n');
console.log(`Wrote assets/map/${target.file} (${style.layers.length} layers)`);
