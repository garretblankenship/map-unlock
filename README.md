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
- **Regions.** Neighbourhoods, cities, counties, parks & forests, states
  and countries come from OpenStreetMap boundaries, prepared by
  `pipeline/` into small static files (see `pipeline/README.md`). When you
  arrive somewhere, the app fetches the tile for your location, finds the
  regions containing you (the smallest of each level, plus every park) and
  fetches their outlines. Everything is cached on the phone, so places
  you've been, or saved for offline use, resolve without signal.
  Completion = unlocked land cells inside the boundary ÷ all land cells
  inside it. Small regions measure water cell by cell; very large ones
  (states, countries) use a coarser estimate. Regions are added only by
  visiting them; there's no place search.
- **No signal? Keep exploring.** GPS works without a connection, and
  unlocking is saved straight to the device, so hikes in the mountains or
  deep woods count in full. Places you pass through without signal (or
  while the app is closed) are queued, and their areas are looked up as
  soon as you're back online. Every request has a deadline, so a weak
  signal can't stall the app.
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

The map styles are `assets/map/style.json` (OpenFreeMap's Liberty) and
`style-dark.json` (OpenFreeMap's Dark), rebuilt by
`node scripts/make-map-style.mjs liberty|dark` to use version-less tile URLs.
(The stock style's tile URLs change with every weekly data release, which
would leave saved areas blank offline after the next release.)

The app bundles this file, and offline downloads fetch the same file from a
web address. By default that's this repository's copy on the jsDelivr CDN,
pinned to a commit. Before launching, host the file yourself (any static
host) and build with `MAP_STYLE_URL=https://…/style.json`. If you change
the style, re-host it at a new URL so existing downloads keep matching.

### Languages

All on-screen text lives in `src/i18n/en.ts` and is read with `t('key')`.
To add a language, copy `en.ts` (e.g. to `fr.ts`), translate it, register
it in `src/i18n/index.ts`, and add its code to `supportedLocales` for the
`expo-localization` plugin in `app.json`. TypeScript reports any missing
entries. The permission texts in `app.json` are translated separately,
through the plugin's `locales` option.

### Tests

```bash
npm test           # everything below
npm run test:unit  # Vitest: game logic, services, store, pipeline contract,
                   #   and the database code against real SQLite (test/)
npm run test:screens  # Jest (jest-expo): every screen rendered in the real
                   #   app, with native modules faked (__tests__/)
npm run typecheck
```

The screen tests start the whole app (`renderApp` in `__tests__/helpers.tsx`)
with a real database (Node's built-in SQLite standing in for expo-sqlite),
a no-op map, fake GPS and no signal. Each test file is a fresh phone.

## Project layout

```
index.ts            entry: registers the background location task, then Expo Router
src/
  app/              screens (Expo Router)
    _layout.tsx     app start-up and the root stack
    (tabs)/         the tab bar: map (index.tsx), regions, offline maps
    settings.tsx    units and reset, opened from Regions
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
    units.ts        metric / imperial formatting
    shareCard.ts    region outline → SVG path for share cards
  services/
    tracking.ts     foreground + background location (expo-location)
    boundaries.ts   OpenStreetMap/Nominatim boundary lookup
    water.ts        water tile download + cache (OpenFreeMap)
    offlineAreas.ts saved offline areas: map pack, water, boundaries
    mapStyle.ts     the map style (bundled + hosted copy)
    net.ts          request deadlines and connectivity
    db.ts           SQLite persistence
    demo.ts         simulated walk for development
  state/store.ts    shared in-memory state for the UI
```

## Launch

The website (privacy policy, terms, support) and the map-data CDN are an
AWS Amplify Gen 2 app in `web/` (see `web/README.md`). Store listing drafts
and the full launch checklist
(store privacy questionnaires, location permission reviews, paid-app setup)
are in `docs/launch/`.

## Before launching publicly

- **Boundary files.** Run `pipeline/run.sh` on the planet, upload the
  output to a static host or CDN, and build with
  `BOUNDARIES_URL=https://…/boundaries/v1`. Without it the app falls back
  to the public Nominatim service, which is for development only.
- **Map and water tiles.** OpenFreeMap is free and asks for no key, but
  it's a community service (consider donating). At scale, consider hosting
  the tiles yourself; OpenFreeMap publishes weekly full-planet downloads.
- **Map style URL.** Host `assets/map/style.json` yourself and set
  `MAP_STYLE_URL` (see *Map style* above).
- **Battery.** Measure real-world drain on long hikes with both phones
  and tune `MOTION_SETTINGS` (`src/core/motion.ts`) if needed. Dropping to
  low power when still is iOS only: Android can't change the location
  service's settings from the background, so it keeps full GPS (batched).
- **Store review.** Apple and Google both scrutinize "Always" location
  access. The permission texts are in `app.json`.
