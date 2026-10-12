import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { BusyTracker, type BusyOptions } from '../core/busy';
import { Viewport, fogForViewport, fogWindow } from '../core/fog';
import { addPendingPlace, removePendingPlace } from '../core/pending';
import { shapeContains } from '../core/geometry';
import {
  LOCAL_LEVELS,
  Region,
  RegionRecord,
  SLOW_WORK,
  addCellsToRegion,
  applyWater,
  hydrateIsSlow,
  hydrateRegion,
} from '../core/regions';
import { tilesForCells } from '../core/water';
import { BASE_ZOOM, LatLng, distanceMeters, latToY, lonToX, parentKey } from '../core/tiles';
import { UnitPreference, UnitSystem, resolveUnits } from '../core/units';
import { t } from '../i18n';
import * as db from '../services/db';
import { regionsAt } from '../services/boundaries';
import { boundaryFilesConfigured } from '../services/boundaryFiles';
import { isOnline, isTransient, onConnectivityChange } from '../services/net';
import { offlineAreas } from '../services/offlineAreas';
import { water } from '../services/water';

/** Preferences from the Settings screen, saved in the meta table. */
export type Settings = { units: UnitPreference };
const DEFAULT_SETTINGS: Settings = { units: 'auto' };

function phoneMeasurementSystem(): string | null {
  try {
    return getLocales()[0]?.measurementSystem ?? null;
  } catch {
    return null;
  }
}

/**
 * In-memory game state shared by every screen. The database is the source of
 * truth (the background GPS task writes straight to it), and this store
 * mirrors it so the map and progress update instantly.
 */
class ExplorationStore {
  /** Unlocked cells are loaded (the map can draw and new fixes can be saved). */
  ready = false;
  /** Regions are still being prepared after launch; lookups wait for them. */
  regionsLoading = true;
  unlocked = new Set<number>();
  regions: Region[] = [];
  selectedRegionId: string | null = null;
  /** Bumped when the map should zoom to the selected region. */
  focusToken = 0;
  /** True while the simulated walk is feeding positions. */
  demoActive = false;
  position: LatLng | null = null;
  tracking = false;
  backgroundTracking = false;
  discovering = false;
  lastError: string | null = null;
  /** Bumped as water tiles arrive, so the fog can be redrawn. */
  waterVersion = 0;
  /** No usable connection. Exploring still works; lookups wait for signal. */
  offline = !isOnline();
  /** Places visited without signal whose areas haven't been looked up yet. */
  pendingPlaces = 0;
  settings: Settings = DEFAULT_SETTINGS;
  private phoneMeasurement = phoneMeasurementSystem();

  private version = 0;
  private listeners = new Set<() => void>();
  /** While the app is off screen, changes are noted but nothing re-renders. */
  private visible = true;
  /** Slow operations in progress, for the loading indicator. */
  private busy = new BusyTracker(() => this.emit());
  /** Database rows at or after this time haven't been seen yet (see refreshCells). */
  private syncedAt = 0;
  private changedWhileHidden = false;
  private levelCache = new Map<number, Set<number>>();
  private lastDiscovery: { at: LatLng; time: number } | null = null;
  private lastCoverageCheck: LatLng | null = null;
  private lastShownPosition: LatLng | null = null;
  private waterTimer: ReturnType<typeof setTimeout> | null = null;
  private lastViewport: Viewport | null = null;

  constructor() {
    // Batch redraws while a screenful of water tiles streams in.
    water.onChange(() => {
      this.waterTimer ??= setTimeout(() => {
        this.waterTimer = null;
        this.waterVersion++;
        this.emit();
      }, 150);
    });

    offlineAreas.queueLookups = (points) => void this.queueLookups(points);

    onConnectivityChange((online) => {
      this.offline = !online;
      this.emit();
      if (online) this.retryNetwork();
    });
  }

  /** Catches up on everything that waited for a connection. */
  retryNetwork() {
    if (!this.ready) return;
    water.retryFailed();
    this.loadRegionWater();
    if (this.lastViewport) this.requestWater(this.lastViewport);
    void this.flushLookups();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  emit() {
    this.version++;
    if (!this.visible) {
      this.changedWhileHidden = true;
      return;
    }
    this.listeners.forEach((fn) => fn());
  }

  /**
   * The app went off or on screen. Off screen, background fixes still update
   * the data, but rendering waits until the app is visible again, which
   * catches up in one go.
   */
  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible && this.changedWhileHidden) {
      this.changedWhileHidden = false;
      this.listeners.forEach((fn) => fn());
    }
  }

  /** What the loading indicator should say, or null when nothing slow is running. */
  get busyLabel(): string | null {
    return this.busy.label;
  }

  /** Runs work with the loading indicator (see core/busy.ts). */
  whileBusy<T>(label: string, work: () => T | Promise<T>, options?: BusyOptions): Promise<T> {
    return this.busy.run(label, work, options);
  }

  /** Prepares a region, with the loading indicator when it'll take a while. */
  private async prepareRegion(rec: RegionRecord): Promise<Region> {
    if (!hydrateIsSlow(rec, this.unlocked.size)) return hydrateRegion(rec, this.unlocked);
    return this.busy.run(t('busy.preparingRegion', { name: rec.name }), () => hydrateRegion(rec, this.unlocked), {
      showFirst: true,
    });
  }

  /**
   * Gets the fog's coarser grid ready for a viewport. Building it means a pass
   * over every unlocked cell, which takes a moment with a long history, so it
   * happens behind the loading indicator rather than mid-render.
   */
  async prepareFog(viewport: Viewport) {
    const { level } = fogWindow(viewport);
    if (level === BASE_ZOOM || this.levelCache.has(level)) return;
    if (this.unlocked.size < SLOW_WORK.unlockedCells / 3) return;
    await this.busy.run(t('busy.drawingFog'), () => this.cellsAtLevel(level), { showFirst: true });
  }

  /** Units to show, from Settings or the phone's region. */
  get units(): UnitSystem {
    return resolveUnits(this.settings.units, this.phoneMeasurement);
  }

  /** Units the phone's region uses, for the 'Automatic' option. */
  get phoneUnits(): UnitSystem {
    return resolveUnits('auto', this.phoneMeasurement);
  }

  async updateSettings(change: Partial<Settings>) {
    this.settings = { ...this.settings, ...change };
    this.emit();
    await db.setMeta('settings', this.settings);
  }

  /** Re-reads phone preferences (Android doesn't restart the app when they change). */
  refreshPhonePreferences() {
    const m = phoneMeasurementSystem();
    if (m === this.phoneMeasurement) return;
    this.phoneMeasurement = m;
    this.emit();
  }

  async load() {
    // Rows written from here on are picked up by refreshCells. A minute of
    // overlap covers clock jitter; anything seen twice is ignored.
    this.syncedAt = Date.now() - 60_000;
    const [cells, records, settings] = await Promise.all([
      db.loadCells(),
      db.loadRegions(),
      db.getMeta<Partial<Settings>>('settings'),
    ]);
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.unlocked = new Set(cells);
    this.levelCache.clear();
    this.regions = [];
    this.regionsLoading = true;
    // The fog can draw now; regions follow without holding up the map.
    this.ready = true;
    this.emit();

    for (const rec of records) {
      // Let the screen update between regions (a country takes a moment).
      await new Promise((r) => setTimeout(r, 0));
      const region = await this.prepareRegion(rec);
      this.regions.push(region);
      if (rec.totalCells === undefined) void db.saveRegionTotal(region.id, region.totalCells);
    }
    this.regionsLoading = false;
    this.selectedRegionId ??= this.defaultSelection();
    this.emit();
    // Cells the background task saved while this was loading.
    void this.refreshCells();
    this.loadRegionWater();
    void this.flushLookups();
    // A position that arrived while regions were loading wasn't checked yet.
    this.lastCoverageCheck = this.position;
    if (this.position) void this.maybeDiscover(this.position);
  }

  /**
   * Picks up cells the background task saved while the app wasn't running in
   * this process. Only rows newer than the last sync are read, not the whole
   * history, so coming back to the app stays instant.
   */
  async refreshCells() {
    const since = this.syncedAt;
    this.syncedAt = Date.now() - 60_000;
    const cells = await db.loadCellsSince(since);
    const fresh = cells.filter((k) => !this.unlocked.has(k));
    if (fresh.length) this.applyNewCells(fresh);
  }

  /** Records cells already saved to the database. */
  applyNewCells(keys: number[]) {
    const fresh = keys.filter((k) => !this.unlocked.has(k));
    if (fresh.length === 0) return;
    for (const k of fresh) this.unlocked.add(k);
    for (const [level, set] of this.levelCache) {
      for (const k of fresh) set.add(parentKey(k, BASE_ZOOM - level));
    }
    for (const r of this.regions) addCellsToRegion(r, fresh, water.lookup);
    this.emit();
  }

  /** Unlocked cells aggregated to a coarser zoom level, cached for the fog renderer. */
  cellsAtLevel = (level: number): Set<number> => {
    if (level === BASE_ZOOM) return this.unlocked;
    let set = this.levelCache.get(level);
    if (!set) {
      set = new Set();
      for (const k of this.unlocked) set.add(parentKey(k, BASE_ZOOM - level));
      this.levelCache.set(level, set);
    }
    return set;
  };

  fog(viewport: Viewport) {
    return fogForViewport(viewport, this.cellsAtLevel, water.lookup);
  }

  /** Fetches water for the area on screen so it can be shown unfogged. */
  requestWater(viewport: Viewport) {
    this.lastViewport = viewport;
    const w = fogWindow(viewport);
    const range = tilesForCells(w.level, w.x0, w.x1, w.y0, w.y1);
    if (!water.has(range)) water.ensure(range).catch(() => undefined);
  }

  /**
   * Switches regions to land-only scoring once their water is known. Safe to
   * call repeatedly; regions that failed (e.g. offline) are retried.
   */
  loadRegionWater() {
    for (const r of this.regions) {
      if (r.landCells !== null) continue;
      water
        .ensure(r.waterTiles)
        .then(async () => {
          if (r.landCells !== null || !this.regions.includes(r)) return;
          // Re-checks every unlocked cell; noticeable with a long history.
          if (this.unlocked.size > SLOW_WORK.unlockedCells) {
            await this.busy.run(t('busy.measuringWater', { name: r.name }), () => applyWater(r, this.unlocked, water.lookup), {
              showFirst: true,
            });
          } else {
            applyWater(r, this.unlocked, water.lookup);
          }
          this.emit();
        })
        .catch(() => undefined);
    }
  }

  get selectedRegion(): Region | null {
    return this.regions.find((r) => r.id === this.selectedRegionId) ?? null;
  }

  selectRegion(id: string | null, focus = false) {
    this.selectedRegionId = id;
    if (focus) this.focusToken++;
    this.emit();
  }

  async addRegions(records: RegionRecord[]) {
    let added = false;
    for (const rec of records) {
      if (this.regions.some((r) => r.id === rec.id)) continue;
      const region = await this.prepareRegion(rec);
      await db.saveRegion({ ...rec, totalCells: region.totalCells });
      this.regions.push(region);
      added = true;
    }
    if (added) {
      this.selectedRegionId ??= this.defaultSelection();
      this.emit();
      this.loadRegionWater();
    }
  }

  async removeRegion(id: string) {
    await db.deleteRegion(id);
    this.regions = this.regions.filter((r) => r.id !== id);
    if (this.selectedRegionId === id) this.selectedRegionId = this.defaultSelection();
    this.emit();
  }

  /**
   * The latest location. Screens only update when it has moved a few metres
   * (the map's own location dot moves smoothly on its own), and region
   * coverage is only re-checked every 50 m.
   */
  setPosition(p: LatLng) {
    this.position = p;
    // Compared with the last position shown or checked, not the last fix:
    // fixes a metre or two apart would otherwise never add up to a change.
    if (!this.lastShownPosition || distanceMeters(this.lastShownPosition, p) >= 3) {
      this.lastShownPosition = p;
      this.emit();
    }
    if (this.lastCoverageCheck && distanceMeters(this.lastCoverageCheck, p) < 50) return;
    this.lastCoverageCheck = p;
    void this.maybeDiscover(p);
  }

  setTracking(foreground: boolean, background: boolean) {
    this.tracking = foreground;
    this.backgroundTracking = background;
    this.emit();
  }

  setError(message: string | null) {
    this.lastError = message;
    this.emit();
  }

  async resetProgress() {
    await this.busy.run(
      t('busy.resetting'),
      async () => {
        await db.resetAll();
        this.lastDiscovery = null;
        this.lastCoverageCheck = null;
        this.selectedRegionId = null;
        await this.load();
      },
      { showFirst: true },
    );
  }

  /** Regions containing a point, smallest first. */
  regionsAt(p: LatLng): Region[] {
    const x = lonToX(p.longitude);
    const y = latToY(p.latitude);
    return this.regions
      .filter((r) => shapeContains(r.shape, x, y))
      .sort((a, b) => a.totalCells - b.totalCells);
  }

  private isCovered(p: LatLng): boolean {
    return this.regionsAt(p).some((r) => LOCAL_LEVELS.includes(r.level));
  }

  /**
   * Queues a lookup of the boundaries around the user when they're somewhere
   * we don't have a neighbourhood or city for yet. Throttled to be gentle on
   * the boundary service. The queue is saved, so places passed through
   * without signal are looked up once there's a connection again.
   */
  private async maybeDiscover(p: LatLng) {
    if (this.regionsLoading) return;
    if (this.isCovered(p)) return;
    const last = this.lastDiscovery;
    if (last && Date.now() - last.time < 120_000 && distanceMeters(last.at, p) < 500) return;
    this.lastDiscovery = { at: p, time: Date.now() };
    const list = await db.updatePendingPlaces((l) => addPendingPlace(l, p));
    this.pendingPlaces = list.length;
    this.emit();
    void this.flushLookups();
  }

  /** Queues places to look up regardless of where the user is, e.g. an area saved for offline use. */
  async queueLookups(points: LatLng[]) {
    const list = await db.updatePendingPlaces((l) => points.reduce(addPendingPlace, l));
    this.pendingPlaces = list.length;
    this.emit();
    void this.flushLookups();
  }

  /** Works through the queued places while there's a connection. */
  async flushLookups() {
    if (this.discovering || !this.ready || this.regionsLoading) return;
    let list = await db.updatePendingPlaces((l) => {
      const open = l.filter((p) => !this.isCovered(p));
      return open.length === l.length ? l : open;
    });
    this.pendingPlaces = list.length;
    // Boundary files cached on the phone (e.g. a saved area) answer without
    // signal, so only skip when offline and there's nothing to fall back on.
    if (list.length === 0 || (!isOnline() && !boundaryFilesConfigured)) return this.emit();

    this.discovering = true;
    this.emit();
    try {
      for (let next: LatLng | undefined = list[0]; next; next = list[0]) {
        const { regions, error } = await regionsAt(next.latitude, next.longitude);
        await this.addRegions(regions);
        if (error) throw error;
        const done = next;
        list = await db.updatePendingPlaces((l) => removePendingPlace(l, done).filter((p) => !this.isCovered(p)));
        this.pendingPlaces = list.length;
        this.emit();
      }
      this.lastError = null;
    } catch (e) {
      // Weak or no signal: the places stay queued for the next attempt.
      if (!isTransient(e)) this.lastError = e instanceof Error ? e.message : String(e);
    } finally {
      this.discovering = false;
      this.emit();
    }
  }

  private defaultSelection(): string | null {
    // Prefer the city (big enough to be a goal, small enough to make
    // progress), then a park or county out in the countryside.
    const here = this.position ? this.regionsAt(this.position) : this.regions;
    const pick = (['city', 'park', 'county'] as const).map((l) => here.find((r) => r.level === l)).find(Boolean);
    return (pick ?? here[0] ?? this.regions[0])?.id ?? null;
  }
}

export const store = new ExplorationStore();

/** Re-renders the component whenever the store changes. */
export function useStore(): ExplorationStore {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
