# Map Unlock

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
- **Fog.** The gray overlay is computed for whatever part of the map is on
  screen. Unlocked cells are traced into outlines and cut out of the fog as
  holes. Zoomed out, the grid coarsens so it stays fast at every scale.
- **Regions.** When you arrive somewhere new, the app looks up the
  administrative boundaries around you (neighbourhood/suburb, city, state,
  country) from OpenStreetMap. Completion = unlocked cells inside the
  boundary ÷ all cells inside the boundary. You can also search for any
  place (e.g. "Sydney") and add it as a goal.
- **Storage.** Everything is stored on the device in SQLite. There are no
  accounts and no servers.

Settings live in `src/core/reveal.ts` (`REVEAL_SETTINGS`) and
`src/core/fog.ts` (`FOG_SETTINGS`).

## Running it

You need Node 20+ and a phone with the **Expo Go** app, or an iOS
simulator/Android emulator.

```bash
npm install
npm start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

Expo Go runs everything except **background** tracking (unlocking while the
app is closed). For that, make a development build:

```bash
npx expo run:android      # or: npx expo run:ios   (needs Android Studio / Xcode)
# or build in the cloud with EAS:
npx eas-cli@latest build --profile development --platform android
```

In development builds, a 🚶 button on the map runs a **simulated jog**, so you
can watch the fog clear without going outside.

### Android map key

Android uses Google Maps. Expo Go works without any setup. Your own builds need
a Google Maps SDK for Android API key:

```bash
export GOOGLE_MAPS_ANDROID_API_KEY=your-key
```

iOS uses Apple Maps and needs no key.

### Tests

```bash
npm test           # grid, reveal, fog tracing and completion maths
npm run typecheck
```

## Project layout

```
src/
  app/              screens (Expo Router): map (index.tsx) and regions list
  core/             pure, unit-tested game logic
    tiles.ts        world grid & coordinate maths
    reveal.ts       GPS fix → unlocked cells (radius, gap filling, filters)
    fog.ts          unlocked cells → fog polygons with holes for the viewport
    geometry.ts     boundary polygons, point-in-polygon, exact cell counts
    regions.ts      region completion and formatting
  services/
    tracking.ts     foreground + background location (expo-location)
    boundaries.ts   OpenStreetMap/Nominatim boundary lookup & search
    db.ts           SQLite persistence
    demo.ts         simulated walk for development
  state/store.ts    shared in-memory state for the UI
```

## Before launching publicly

- **Boundary service.** The public Nominatim server allows 1 request/second
  and isn't meant for app traffic at scale. Self-host Nominatim, or
  precompute boundary files and serve them from a CDN.
- **Battery.** Background tracking uses high-accuracy GPS. Consider
  lowering accuracy, or pausing when the phone is stationary.
- **Store review.** Apple and Google both scrutinize "Always" location
  access. The permission texts are in `app.json`.
