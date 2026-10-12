# Handoff: where Open World Life stands

_Last updated 2026-10-12 (second session). Read this first in a new session,
then continue with "Next up" below. `main` is the default branch and holds
all work so far (the earlier `ccr-*` session branches are merged into it)._

## What the app is

**Open World Life** (`com.openworldlife.app`): a paid, worldwide, English-only
fog-of-war exploration game. The map starts fogged; everything within 50 m of
where you walk, hike, cycle or drive is unlocked. Every neighbourhood, city,
county, park/forest, state and country you visit gets a land-only completion
percentage. Built for the outdoors: works with no signal and is very
battery-conscious. No accounts, no servers holding user data.

Repo layout (details in README.md):

- `src/` Expo SDK 57 app (Expo Router, MapLibre, expo-location, expo-sqlite).
  `src/core/` is pure, unit-tested logic; `src/services/` talks to the device
  and network; `src/state/store.ts` is the app state.
- `pipeline/` turns OpenStreetMap data into static region boundary files
  (see `pipeline/README.md`). `shared/boundaryCodec.ts` is shared with the app.
- `web/` one AWS Amplify Gen 2 app: Astro website (landing, privacy, terms,
  support) + the map-data CDN (S3 + CloudFront as custom CDK resources).
  See `web/README.md`. Built by root `amplify.yml` (monorepo root `web`).
- `docs/launch/` store listing drafts and the launch checklist.

## Decisions already made (don't re-ask)

| Topic | Decision |
|---|---|
| Audience | Public app, small launch, worldwide |
| Price | Paid upfront (no in-app purchases) |
| Backups | Phone backups only (iCloud / Google); no accounts or cloud sync |
| Regions | Own boundary files built from OSM, hosted on CloudFront (not Nominatim) |
| Region types | Neighbourhood, city, county, park & forest, state, country |
| Reveal radius | 50 m for every kind of travel |
| Battery | Smart saving: full GPS while moving, low power when still. **iOS only**: Android can't change the location service's settings from the background (expo-location throws), so it keeps full GPS while background exploring is on (see "What's done", 10) |
| Sharing | Image card with outline + percentage only, never streets |
| Search | None; regions are added only by visiting |
| Location permission | "While Using" first; "Always" only after an explainer when background exploring is turned on |
| Units | Follow the phone, overridable in Settings |
| Appearance | Dark mode follows the phone |
| Languages | English only, all text in `src/i18n/en.ts` |
| Hosting | AWS: Amplify Gen 2 for everything possible, CloudFront CDN |
| Domain | openworldlife.com (registered); support@openworldlife.com |
| Loading UI | A loading pill for anything that may take over ~0.5 s |
| Removing a region | It stays removed (lookups don't bring it back) until progress is reset |

## What's done

All committed and pushed. Highlights, in order:

1. Network checks of OpenFreeMap and Nominatim; weak-signal handling (request
   deadlines, persisted lookup queue, backoff after timeouts).
2. MapLibre map with offline area downloads (map + water + boundaries),
   version-less tile URLs so saved areas survive OpenFreeMap's weekly updates.
3. Launch slices S1–S13: rename, no search, string catalog, backups (Android
   backup rules plugin), units + Settings, "Always" explainer, battery motion
   modes, dark mode, share cards, county/park levels, boundary pipeline, app
   reading boundary files, store-readiness docs.
4. `web/`: Amplify Gen 2 website + CDN, upload script, Settings links to the
   site; domain wired in (`eas.json` WEBSITE_URL, canonical URLs).
5. Battery/smoothness audit: background GPS that can actually detect
   stillness (timer-based fixes, native batching ~1/min), on-screen GPS
   stopped off screen, no rendering off screen, batched DB writes, cells
   indexed by time, grid index for region borders (US check 2978 ms -> 23 ms
   on 200k cells), cached region cell totals, progressive startup, frozen
   hidden tabs, position/coverage throttles.
6. Loading pill for slow work (`src/core/busy.ts`, `BusyIndicator.tsx`).

Second session (2026-10-12), the agreed items 1–4:

7. **Android compiles natively**, debug and release (arm64). One command:
   `scripts/sandbox/build-android.sh [scratch-dir] [assembleDebug|assembleRelease]`
   (prebuilds a scratch copy of HEAD, installs the SDK, mirrors Maven
   Central to Google's copy, which fixed the 429s). The release APK (~59 MB)
   holds the Hermes bundle. The build showed Expo's template adding
   SYSTEM_ALERT_WINDOW and storage permissions; they're now blocked in
   `app.json`. Only MapLibre's own Kotlin deprecation warnings remain.
8. **Database code tested against real SQLite** (`test/`): an expo-sqlite
   stand-in on Node's built-in `node:sqlite` runs `db.ts` for real (inserts,
   migrations from a first-release database, the time index, the cache split,
   the iOS folder layout).
9. **Render tests for every screen** (`__tests__/`, Jest + jest-expo + React
   Native Testing Library): the whole app through Expo Router with a real
   database, fake GPS/permissions, a no-op map, no signal. 24 tests.
10. **Full code review** by four reviewers (GPS, offline/network, DB/store/
    screens, website/CDN); fixes, all committed:
    - Background task registered from `index.ts` (the new `main`): a headless
      relaunch (Android killed the app mid-walk) loads no routes, so a task
      defined in a route module dropped every batch.
    - Android motion switching removed (see Decisions); iOS records a switch
      only once applied. On-screen GPS can't run in the background after an
      iOS background launch; overlapping starts can't leak a watcher.
    - Trail: cells saved before the last fix; no straight-line fill after a
      long break (>3 min and >200 m); short way across 180°; GPS wakes after
      300 m whatever the accuracy; 3 m map throttle compares with the last
      shown position.
    - Boundary files: parsed before caching (a captive-portal page cached as
      meta.json used to break lookups until reinstall); in-flight requests
      shared. Lookup queue: one failing place no longer blocks the rest
      (a saved area answers offline); server errors still stop the run;
      single-flight; no duplicate regions; reset during startup is safe.
    - Offline areas: downloads stop on weak signal and resume when the
      backoff ends; water prefetch doesn't fill memory or redraw the fog;
      status after createPack; errors clear on recovery.
    - iOS: `cache.db` moved from Documents (iCloud-backed) to Library/Caches;
      if iOS empties it, saved areas re-download water and boundaries.
    - 180° meridian: share cards draw such regions in one piece; picking one
      frames its largest part; views across 180° can't crash the fog.
    - Website/CDN: upload script refuses to overwrite a published version and
      writes meta.json last; CDN root is a 404 (not a bucket listing); the
      `main` branch build fails while `site.ts` has placeholders; 404 page
      noindex; privacy policy now says area downloads reveal roughly where an
      area is and that no CDN logs are kept; "location never leaves your
      phone" became "location history stays on your phone" everywhere.

State at handoff: 129 Vitest + 24 Jest tests pass (`npm test` runs both);
typecheck (app + pipeline + test/ + __tests__/ + web) clean; lint 0 errors /
3 old `exhaustive-deps` warnings; `expo-doctor` 21/21; iOS and Android JS
bundles export; Android debug and release APKs build; web build + synth pass.

## Next up (agreed plan, do in this order)

Nothing here needs a phone. Items 1–4 of the earlier plan are done (see
"What's done", 7–10); these remain, in order:

5. Tune boundary classification for more countries using BBBike city
   extracts (UK, France, Canada, Australia, Brazil, India, Spain…). Known
   issues: German kreisfreie Städte show as "County"; Berlin has no city.
6. Dependency audit: `npm audit --omit=dev` shows 31 issues (20 high), mostly
   in Expo build tooling; see what actually ships and update safely.
7. Small cleanups: the 3 lint warnings, formatting of older files, README
   refresh, accessibility pass.
8. Optional features: "download saved areas on Wi-Fi only"; a placeholder app
   icon/splash in the website's fog-trail style (current icon is Expo's
   template "A").
9. Review findings left open on purpose (small, or need a device to verify):
   - Regions across 180° still get a world-wide bounding box for water tiles
     (coarse water for the US/Russia) and can't be saved offline (Fiji is
     refused as too big). Needs bounds that wrap, checked against MapLibre
     on a device.
   - `saveCells` uses a non-exclusive transaction, so another write landing
     during it would roll back with it on an error; `resetAll` isn't one
     transaction. Exclusive transactions open a second connection
     (risk of "database is locked"), so this was left as is.
   - Offline boundary prefetch stops at 300 tiles / 600 region files and
     still calls the area complete (only very dense areas reach the cap).
   - A region being prepared misses cells unlocked during its preparation
     (only the save itself is covered now); corrected at the next launch.

## Waiting on the owner

- `web/src/site.ts`: publisher name, governing law, policy date.
- Is openworldlife.com in Route 53 or another registrar? Now also needed for
  **a custom domain on the map-data CDN (e.g. data.openworldlife.com) before
  the first store build**: store builds bake in BOUNDARIES_URL/MAP_STYLE_URL
  and a `dxxxx.cloudfront.net` address dies with the stack (web/README.md).
- Review the privacy policy wording changed this session (what area
  downloads reveal; no CDN logs) before publishing.
- iPad: keep `ios.supportsTablet` (needs iPad screenshots/testing) or turn off for v1?
- Final app icon artwork (or approve a placeholder).
- Later, with a computer/phone: create the Amplify app (monorepo root `web`),
  run the planet pipeline and `web/scripts/upload-map-data.sh`, put
  BOUNDARIES_URL and MAP_STYLE_URL in `eas.json` (production builds refuse
  without them), device testing (battery on a long walk with a stop, airplane
  mode hike with a saved area; Android: force-stop or kill the app mid-walk
  with background exploring on and check the walk is still recorded; iOS:
  saved area still works after "Offload"/low storage), store screenshots.

## How to verify changes

```bash
npm run typecheck                 # app, pipeline, test/, __tests__/
npx expo lint
npm test                          # Vitest (unit, real SQLite) then Jest (screens)
npx expo export --platform android --platform ios --output-dir /tmp/export
npx -y expo-doctor
cd web && npm run typecheck && npm run build && npm run synth
scripts/sandbox/build-android.sh  # native Android build (~10 min first time)
```

Per AGENTS.md: use `npx expo install` for app packages and check the SDK 57
docs before touching Expo APIs.

## Environment notes (cloud sessions)

- No Android emulator (no /dev/kvm). Chromium + Playwright work
  (`/opt/pw-browsers/chromium`, import from `/opt/node-tools/node_modules/playwright`)
  for screenshotting the website or HTML mock-ups.
- Geofabrik and Overpass were unreachable; BBBike extracts work
  (`https://download.bbbike.org/osm/bbbike/<City>/<City>.osm.pbf`).
  `apt-get install osmium-tool` works. Regional builds need
  `DEFAULT_COUNTRY=XX pipeline/run.sh ...` when the country border is cut off.
- `web/` uses `npm install`, not `npm ci`: `@aws-amplify/data-construct`
  bundles a package whose dependency isn't bundled, which `npm ci` rejects.
- `pkill -f <pattern>` inside a command whose text contains the pattern kills
  that command itself; kill by PID instead.
- The app's `tsconfig.json` sets `"types": []` (no Node globals in app code);
  tests needing Node APIs live in `pipeline/` or `test/` (Vitest) and
  `__tests__/` (Jest), each with its own tsconfig. Test-only `?raw` imports
  are typed in `src/types/raw.d.ts`.
- Screen tests: `renderRouter` turns on Jest fake timers mid-render, so
  `package.json` "jest.fakeTimers" fakes only `Date`. Don't wrap GPS/alert
  helpers in `act()`: overlapping the app's own async updates stalls every
  later render in the file. Jest finds `expo-asset` (nested under `expo/`)
  through `modulePaths`.
- Maven Central answers 429 at times; `scripts/sandbox/maven-central-mirror.gradle`
  (installed by the build script into `~/.gradle/init.d/`) fixes it.
