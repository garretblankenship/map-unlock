# Handoff: where Open World Life stands

_Last updated 2026-10-12. Read this first in a new session, then continue
with "Next up" below. Work happens on branch `ccr-7f03759b-ixjurl`._

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
| Battery | Smart saving: full GPS while moving, low power when still |
| Sharing | Image card with outline + percentage only, never streets |
| Search | None; regions are added only by visiting |
| Location permission | "While Using" first; "Always" only after an explainer when background exploring is turned on |
| Units | Follow the phone, overridable in Settings |
| Appearance | Dark mode follows the phone |
| Languages | English only, all text in `src/i18n/en.ts` |
| Hosting | AWS: Amplify Gen 2 for everything possible, CloudFront CDN |
| Domain | openworldlife.com (registered); support@openworldlife.com |
| Loading UI | A loading pill for anything that may take over ~0.5 s |

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

State at handoff: 99 tests pass; typecheck (app + pipeline + web) clean; lint
0 errors / 3 old `exhaustive-deps` warnings; `expo-doctor` 21/21; iOS and
Android JS bundles build; backend synth checks pass (`cd web && npm run synth`).

## Next up (agreed plan, do in this order)

Nothing here needs a phone. The owner approved starting with 1–4.

1. **Compile the Android app natively.** Never succeeded before because Maven
   Central rate-limited (HTTP 429); on 2026-10-12 it answered 200 again.
   Recipe: `npx expo prebuild --no-install` in a scratch copy (never commit
   `android/`/`ios/`), install the Android SDK (cmdline-tools from
   dl.google.com; platform 36, build-tools 36.0.0, NDK 27.1.12297006,
   cmake 3.22.1), then `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`.
   If 429s return, a Gradle init script mirroring Maven Central to
   `https://maven-central.storage-download.googleapis.com/maven2/` didn't
   reach the included builds last time; try it in `settings.gradle`
   pluginManagement too.
2. **Test database SQL against real SQLite** (e.g. better-sqlite3 behind an
   expo-sqlite-shaped shim): multi-row inserts, the `total_cells` column
   migration, the `cells_by_time` index, moving water into `cache.db`.
3. **Render tests for every screen** (jest-expo + React Native Testing
   Library alongside vitest) to catch crashes without a device.
4. **Full code review** of the session's work (GPS, offline, DB, boundaries,
   website) and fix findings.
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

## Waiting on the owner

- `web/src/site.ts`: publisher name, governing law, policy date.
- Is openworldlife.com in Route 53 or another registrar?
- iPad: keep `ios.supportsTablet` (needs iPad screenshots/testing) or turn off for v1?
- Final app icon artwork (or approve a placeholder).
- Later, with a computer/phone: create the Amplify app (monorepo root `web`),
  run the planet pipeline and `web/scripts/upload-map-data.sh`, put
  BOUNDARIES_URL and MAP_STYLE_URL in `eas.json` (production builds refuse
  without them), device testing (battery on a long walk with a stop, airplane
  mode hike with a saved area), store screenshots.

## How to verify changes

```bash
npm run typecheck                 # app + pipeline
npx expo lint
npm test                          # vitest: core, services, store, pipeline contract
npx expo export --platform android --platform ios --output-dir /tmp/export
npx -y expo-doctor
cd web && npm run typecheck && npm run build && npm run synth
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
  tests needing Node APIs live in `pipeline/`. Test-only `?raw` imports are
  typed in `src/types/raw.d.ts`.
