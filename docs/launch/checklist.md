# Launch checklist

## Infrastructure (AWS, see `web/README.md`)

- [ ] Deploy `web/` as an Amplify Gen 2 app (monorepo root `web`): the
      website plus the map-data CDN (S3 + CloudFront).
- [ ] Run the boundary pipeline on the planet (`pipeline/README.md`) and
      publish it with `web/scripts/upload-map-data.sh`.
- [ ] Set `BOUNDARIES_URL`, `MAP_STYLE_URL` and `WEBSITE_URL` in `eas.json`
      (production builds refuse to build without them).
- [ ] Consider donating to OpenFreeMap, which serves the map tiles for free.

## Before the first store build

- [ ] **App icon and splash screen.** `assets/` still has Expo's template
      icon (the blue "A"). Needs real artwork: 1024×1024 icon, Android
      adaptive icon layers, splash image.
- [ ] **iPad.** `ios.supportsTablet` is true, which means iPad screenshots
      and testing are required. Set it to false for an iPhone-only v1, or
      keep it and test on iPad.
- [ ] Set the version (`app.json` → `version`); EAS auto-increments build
      numbers for production (`eas.json`).
- [ ] Fill in `web/src/site.ts` (publisher, support email, governing law,
      date). The privacy policy, terms and support pages are on the website;
      use `WEBSITE_URL/privacy/` and `WEBSITE_URL/support/` in both stores.
- [ ] Device testing on real iPhone and Android: a hike with no signal, a
      saved offline area, background exploring with the screen off,
      battery over a long day, dark mode, the share sheet.

## Paid app setup

- App Store Connect: accept the Paid Apps agreement and add banking and
  tax details, then set the price tier.
- Google Play Console: set up a payments profile (merchant account), then
  set the app as paid. A free app can't later become paid on Google Play,
  so choose paid from the first release.
- No in-app purchase code is needed for a paid-upfront app.

## Store privacy questionnaires

_Guidance, not legal advice; check against each store's current definitions._

**App Store "App Privacy":** the app sends no data to you or partners, and
map and boundary downloads only serve the request in real time. That fits
**Data Not Collected**.

**Google Play "Data safety":** location is processed on the device and never
sent to you. Map tile and boundary requests reveal which map area is being
viewed to the tile host. Google treats data sent off the device as
"collected" even if processed ephemerally, so the conservative answer is:
Approximate location: collected, not shared, processed ephemerally, required
for app functionality. No other data types. No data is sold; there's no
account to delete (data deletion: in-app reset or uninstall).

## Location permission reviews

- **Apple:** the app asks for "While Using" first and only asks for
  "Always" after the in-app explainer when the player turns on background
  exploring. In the review notes, say: "Background location keeps clearing
  the map while the phone is in a pocket on walks and hikes. Turn it on with
  the 'Background exploring' button on the map. Location never leaves the
  device."
- **Google Play:** background location needs the Permissions Declaration
  form in Play Console, with a short video showing the explainer, the system
  prompt, and the feature working with the app in the background. The
  foreground service notification ("Open World Life is exploring") must stay
  visible while it runs, which it does.

## Building and submitting

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios      # needs App Store Connect API key
npx eas-cli@latest submit --platform android  # needs a Play service account
```
