# Open World Life

A fog-of-war exploration game for the real world, for iOS and Android. The map
starts grayed out. As you walk or run around, the area near you gets
unlocked, like uncovering the map in an open-world video game. Every
neighbourhood, city, state and country you visit gets a progress score
(e.g. "Sydney — 3.4% unlocked"), so you can set out to unlock all of it.

## How it works

- **Grid.** The world is divided into ~30m square cells (Web Mercator zoom-20
  tiles). Anything within **50m** of where you've been is unlocked. If GPS
  updates arrive sparsely, the gap between two points is filled in.
- **Any ground travel counts.** Walking, cycling, driving and trains all
  unlock the map, so highways and rail corridors can be completed too.
  Fixes worse than 40m accuracy are ignored, and so is movement faster
  than ~250 km/h (flights and GPS glitches).
- **Water is never fogged.** Oceans, harbours, lakes and rivers come from
  the OpenStreetMap water layer (via OpenFreeMap vector tiles, no API key
  needed). They're drawn unlocked from the start and are left out of every
  region's score, so percentages are **land only** and 100% is reachable
  on land. Water tiles are downloaded once and cached on the device.
- **Fog.** The gray overlay is computed for whatever part of the map is on
  screen. Unlocked cells are traced into outlines and cut out of the fog as
  holes. Zoomed out, the grid coarsens so it stays fast at every scale.
- **Regions.** When you arrive somewhere new, the app looks up the
  administrative boundaries around you (neighbourhood/suburb, city, state,
  country) from OpenStreetMap. Completion = unlocked land cells inside the
  boundary ÷ all land cells inside the boundary. Small regions measure
  water cell by cell. Very large ones (states, countries) use a coarser
  water estimate. You can also search for any
  place (e.g. "Sydney") and add it as a goal.
- **Storage.** Everything is stored on the device in SQLite. There are no
  accounts and no servers.
- **No signal? Keep exploring.** GPS works without a connection, and
  unlocking is saved straight to the device, so hikes in the mountains or
  deep woods count in full. Places you pass through without signal (or
  while the app is closed) are queued, and their areas are looked up as
  soon as you're back online. Every request has a deadline, so a weak
  signal can't stall the app. Search needs a connection.
- **Offline maps.** The map is drawn with MapLibre from OpenStreetMap
  vector tiles (OpenFreeMap, no API key). Before heading out of signal,
  tap the download button on the map (or long-press a region) to save an
  area: the map, its lakes and rivers, and its boundaries are stored on the
  phone. The **Offline** tab shows progress and storage, and downloads
  resume by themselves after the app is closed or signal drops. Recently
  viewed map areas are also cached (up to 256 MB).

Settings live in `src/core/reveal.ts` (`REVEAL_SETTINGS`) and
`src/core/fog.ts` (`FOG_SETTINGS`).

## Running it

You need Node 20+ and a **development build** of the app: the MapLibre map
has native code that Expo Go doesn't include. Build one once, then iterate
on the JavaScript with the dev server as usual:

```bash
npm install
npx expo run:android      # or: npx expo run:ios   (needs Android Studio / Xcode)
# or build in the cloud with EAS, no Android Studio / Xcode needed:
npx eas-cli@latest build --profile development --platform android
npm start                 # then open the development build on your phone
```

In development builds, a 🚶 button on the map runs a **simulated jog**, so you
can watch the fog clear without going outside.

### Map style

The map style is `assets/map/style.json`: OpenFreeMap's Liberty style,
rebuilt by `node scripts/make-map-style.mjs` to use version-less tile URLs.
(The stock style's tile URLs change with every weekly data release, which
would leave saved areas blank offline after the next release.)

The app bundles this file, and offline downloads fetch the same file from a
web address. By default that's this repository's copy on the jsDelivr CDN,
pinned to a commit. Before launching, host the file yourself (any static
host) and build with `MAP_STYLE_URL=https://…/style.json`. If you change
the style, re-host it at a new URL so existing downloads keep matching.

### Tests

```bash
npm test           # grid, reveal, fog tracing, water masks and completion maths
npm run typecheck
```

## Project layout

```
src/
  app/              screens (Expo Router): map (index.tsx), regions list, offline maps
  core/             pure, unit-tested game logic
    tiles.ts        world grid & coordinate maths
    reveal.ts       GPS fix → unlocked cells (radius, gap filling, filters)
    fog.ts          unlocked cells → fog polygons with holes for the viewport
    geometry.ts     boundary polygons, point-in-polygon, exact cell counts
    scanline.ts     polygon → grid cell rasterization
    water.ts        vector-tile water layer → per-cell water masks
    regions.ts      region completion and formatting
    mapgeo.ts       fog/outlines → GeoJSON for the map, download sizing
    pending.ts      places waiting for a boundary lookup (offline queue)
  services/
    tracking.ts     foreground + background location (expo-location)
    boundaries.ts   OpenStreetMap/Nominatim boundary lookup & search
    water.ts        water tile download + cache (OpenFreeMap)
    offlineAreas.ts saved offline areas: map pack, water, boundaries
    mapStyle.ts     the map style (bundled + hosted copy)
    net.ts          request deadlines and connectivity
    db.ts           SQLite persistence
    demo.ts         simulated walk for development
  state/store.ts    shared in-memory state for the UI
```

## Before launching publicly

- **Boundary service.** The public Nominatim server allows 1 request/second
  and isn't meant for app traffic at scale. Self-host Nominatim, or
  precompute boundary files and serve them from a CDN.
- **Map and water tiles.** OpenFreeMap is free and asks for no key, but
  it's a community service (consider donating). At scale, consider hosting
  the tiles yourself; OpenFreeMap publishes weekly full-planet downloads.
- **Map style URL.** Host `assets/map/style.json` yourself and set
  `MAP_STYLE_URL` (see *Map style* above).
- **Battery.** Background tracking uses high-accuracy GPS. Consider
  lowering accuracy, or pausing when the phone is stationary.
- **Store review.** Apple and Google both scrutinize "Always" location
  access. The permission texts are in `app.json`.
