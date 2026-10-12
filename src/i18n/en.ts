/**
 * English text for the whole app. To add a language, copy this file (e.g.
 * fr.ts), translate every entry, and register it in i18n/index.ts; the
 * `Catalog` type makes the compiler list anything missing. Entries that
 * take values are functions, so each language can order words and handle
 * plurals its own way.
 */
const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const en = {
  // Tabs
  'tab.map': 'Map',
  'tab.regions': 'Regions',
  'tab.offline': 'Offline',

  // Shared buttons
  'action.cancel': 'Cancel',
  'action.save': 'Save',
  'action.delete': 'Delete',
  'action.remove': 'Remove',
  'action.reset': 'Reset',

  // Region levels: singular for labels, plural for section headings
  'level.neighbourhood': 'Neighbourhood',
  'level.city': 'City',
  'level.county': 'County',
  'level.park': 'Park / forest',
  'level.state': 'State / province',
  'level.country': 'Country',
  'levels.neighbourhood': 'Neighbourhoods',
  'levels.city': 'Cities',
  'levels.county': 'Counties',
  'levels.park': 'Parks & forests',
  'levels.state': 'States & provinces',
  'levels.country': 'Countries',

  // Progress
  'progress.landUnlocked': (p: { explored: string; total: string }) => `${p.explored} of ${p.total} of land unlocked`,
  'progress.ofLand': (p: { explored: string; total: string }) => `${p.explored} of ${p.total} of land`,
  'progress.measuringWater': ' (measuring water…)',

  // Map screen
  'map.tapToChange': ' · tap to change region',
  'map.finding': 'Finding the areas around you…',
  'map.loadingRegions': 'Loading your regions…',
  'map.noSignal': 'No signal — exploring still counts. Areas are looked up once you’re back online.',
  'map.noRegions': 'No regions yet — they appear as you explore.',
  'map.waitingForLocation': 'Waiting for your location…',
  'map.offlineSaved': 'Offline · progress is saved',
  'map.weakSignal': 'Waiting for a better signal',
  'map.placesToLookUp': (p: { count: number }) => ` · ${p.count} ${plural(p.count, 'place', 'places')} to look up`,
  'map.backgroundOn': 'Exploring in background',
  'map.backgroundOff': 'Background exploring off',
  'map.a11y.demo': 'Simulate a walk',
  'map.a11y.saveArea': 'Save this area for offline use',
  'map.a11y.centerOnMe': 'Center on my location',
  'map.areaTooBig.title': 'Area too big',
  'map.areaTooBig.body': 'Zoom in on the place you’re heading to, then save it.',
  'map.areaName': (p: { lat: string; lon: string }) => `Area at ${p.lat}, ${p.lon}`,
  'map.saveArea.title': 'Save this area for offline use?',
  'map.saveArea.body': (p: { size: string }) =>
    `Saves the map, water and boundaries for what’s on screen, so it works without signal. ` +
    `Roughly ${p.size} (less in the countryside, more in cities). Wi-Fi recommended.`,

  // Saving areas (shared by map and regions)
  'save.failed': 'Couldn’t save this area',
  'save.needsDevBuild': 'Offline maps need a development build of the app (not Expo Go).',
  'save.tooBig': 'That area is too big to save. Zoom in and try again.',

  // Regions screen
  'regions.title': 'Regions',
  'regions.subtitle':
    'Every area you explore is added here automatically: neighbourhoods, cities, counties, parks and forests, ' +
    'states and countries.',
  'regions.youAreHere': 'You are here',
  'regions.lookingUp': 'Looking up the areas around you…',
  'regions.savedAwaitingSignal': 'Your exploring is saved. The areas you visited will appear once you have signal.',
  'regions.empty': 'No regions yet. Start exploring and they’ll appear here.',
  'regions.cellsUnlocked': (p: { count: string }) =>
    `${p.count} map cells unlocked. Long-press a region to save it offline or remove it.`,
  'regions.reset': 'Reset all progress',
  'regions.reset.title': 'Reset all progress?',
  'regions.reset.body': 'This re-fogs the whole map and forgets every region. It can’t be undone.',
  'regions.remove.title': (p: { name: string }) => `Remove ${p.name}?`,
  'regions.remove.body': 'Your explored areas are kept; only this region’s progress card is removed.',
  'regions.action.saveOffline': 'Save for offline use',
  'regions.action.remove': 'Remove region',
  'regions.tooBig.title': (p: { name: string }) => `${p.name} is too big to save`,
  'regions.tooBig.body': 'Save a smaller part instead: zoom the map in on where you’re going and tap the download button.',
  'regions.save.title': (p: { name: string }) => `Save ${p.name} for offline use?`,
  'regions.save.body': (p: { size: string }) =>
    `Roughly ${p.size} (less in the countryside, more in cities). Wi-Fi recommended.`,
  'regions.attribution': 'Boundaries and water © OpenStreetMap contributors · water tiles by OpenFreeMap / OpenMapTiles',

  // Share card
  'share.title': 'Share progress',
  'share.unlocked': 'of land unlocked',
  'share.app': 'Open World Life',
  'share.privacy': 'Only the outline and your percentage are shared, never the streets you’ve explored.',
  'share.button': 'Share',
  'share.failed': 'Couldn’t share',
  'share.unavailable': 'Sharing isn’t available on this device.',
  'share.dialogTitle': (p: { name: string }) => `${p.name} progress`,
  'share.a11y.open': 'Share progress',
  'regions.action.share': 'Share progress',

  // Loading indicator for slow operations
  'busy.preparingRegion': (p: { name: string }) => `Preparing ${p.name}…`,
  'busy.measuringWater': (p: { name: string }) => `Measuring the water in ${p.name}…`,
  'busy.drawingFog': 'Drawing your map…',
  'busy.resetting': 'Resetting progress…',
  'busy.savingArea': 'Saving area…',
  'busy.startingBackground': 'Turning on background exploring…',
  'busy.sharing': 'Making your card…',

  // Settings screen
  'settings.title': 'Settings',
  'settings.a11y.open': 'Settings',
  'settings.units': 'Units',
  'settings.units.auto': 'Automatic',
  'settings.units.autoDetail': (p: { system: string }) => `Follows your phone (${p.system})`,
  'settings.units.metric': 'Metric',
  'settings.units.metricDetail': 'Kilometres, km²',
  'settings.units.imperial': 'Imperial',
  'settings.units.imperialDetail': 'Miles, acres, mi²',
  'settings.progress': 'Progress',
  'settings.attribution': 'Map data',
  'settings.about': 'About',
  'settings.privacy': 'Privacy policy',
  'settings.terms': 'Terms of use',
  'settings.support': 'Help & support',

  // Offline screen
  'offline.title': 'Offline maps',
  'offline.intro.before': 'Heading somewhere without signal? Before you go, open the map on the area and tap ',
  'offline.intro.after': ' to save it. You can also long-press a region to save it.',
  'offline.empty': 'No saved areas yet.',
  'offline.storage': (p: { size: string }) => `Using ${p.size} of storage.`,
  'offline.note':
    'Without signal you can still explore anywhere: your progress is always saved. Saved areas add the map ' +
    'underneath, lakes and rivers, and the regions you’re working on. Areas you’ve recently looked at are also ' +
    'kept for a while.',
  'offline.ready': (p: { size: string }) => `Ready to use offline${p.size}`,
  'offline.problem': (p: { error: string }) => `Download problem: ${p.error}`,
  'offline.unknownError': 'unknown error',
  'offline.waitingForSignal': (p: { percent: number; size: string }) => `Waiting for signal · ${p.percent}%${p.size}`,
  'offline.paused': (p: { percent: number; size: string }) => `Paused · ${p.percent}%${p.size}`,
  'offline.downloading': (p: { percent: number; size: string }) => `Downloading… ${p.percent}%${p.size}`,
  'offline.delete.title': (p: { name: string }) => `Delete ${p.name}?`,
  'offline.delete.body': 'The saved map for this area is removed from your phone. Your exploring is kept.',
  'offline.a11y.delete': (p: { name: string }) => `Delete ${p.name}`,
  'offline.defaultName': 'Saved area',

  // Background exploring explainer (shown before the system's "Always" prompt)
  'background.title': 'Keep exploring with the app closed',
  'background.body':
    'To unlock the map while your phone is in your pocket, Open World Life needs to use your location ' +
    'even when the app isn’t open.',
  'background.point.private': 'Your location never leaves your phone. There are no accounts and no servers.',
  'background.point.battery': 'GPS backs off when you’re standing still, to save battery on long days out.',
  'background.point.stop': 'Turn it off any time from the map.',
  'background.ios': 'On the next screen, choose “Change to Always Allow”.',
  'background.android': 'On the next screen, choose “Allow all the time”.',
  'background.blocked':
    'Location access is currently limited. Open Settings, then set Location to “Always” (iPhone) or ' +
    '“Allow all the time” (Android).',
  'background.continue': 'Continue',
  'background.openSettings': 'Open Settings',
  'background.notNow': 'Not now',

  // Location and tracking
  'location.permissionNeeded': 'Location permission is needed to unlock the map.',
  'location.error': (p: { reason: string }) => `Location error: ${p.reason}`,
  'location.backgroundUnavailable': 'Background location isn’t available in this build. Use a development build (see README).',
  'location.allowAlways': 'Allow location access "Always" to keep unlocking while the app is closed.',
  'location.notification.title': 'Open World Life is exploring',
  'location.notification.body': 'Unlocking the map as you move.',

  // Boundaries
  'boundaries.lookupFailed': (p: { status: number }) => `Boundary lookup failed (${p.status})`,
  'boundaries.unnamed': 'Unnamed area',
};
