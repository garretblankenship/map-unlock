import { useSyncExternalStore } from 'react';

import { Viewport, fogForViewport } from '../core/fog';
import { shapeContains } from '../core/geometry';
import { Region, RegionRecord, addCellsToRegion, hydrateRegion } from '../core/regions';
import { BASE_ZOOM, LatLng, distanceMeters, latToY, lonToX, parentKey } from '../core/tiles';
import * as db from '../services/db';
import { regionsAt } from '../services/boundaries';

/**
 * In-memory game state shared by every screen. The database is the source of
 * truth (the background GPS task writes straight to it), and this store
 * mirrors it so the map and progress update instantly.
 */
class ExplorationStore {
  ready = false;
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

  private version = 0;
  private listeners = new Set<() => void>();
  private levelCache = new Map<number, Set<number>>();
  private lastDiscovery: { at: LatLng; time: number } | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  async load() {
    const [cells, records] = await Promise.all([db.loadCells(), db.loadRegions()]);
    this.unlocked = new Set(cells);
    this.levelCache.clear();
    this.regions = records.map((r) => hydrateRegion(r, this.unlocked));
    this.selectedRegionId ??= this.defaultSelection();
    this.ready = true;
    this.emit();
  }

  /** Re-reads the database, e.g. after the background task ran while the UI was asleep. */
  async refreshCells() {
    const cells = await db.loadCells();
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
    for (const r of this.regions) addCellsToRegion(r, fresh);
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
    return fogForViewport(viewport, this.cellsAtLevel);
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
      await db.saveRegion(rec);
      this.regions.push(hydrateRegion(rec, this.unlocked));
      added = true;
    }
    if (added) {
      this.selectedRegionId ??= this.defaultSelection();
      this.emit();
    }
  }

  async removeRegion(id: string) {
    await db.deleteRegion(id);
    this.regions = this.regions.filter((r) => r.id !== id);
    if (this.selectedRegionId === id) this.selectedRegionId = this.defaultSelection();
    this.emit();
  }

  setPosition(p: LatLng) {
    this.position = p;
    this.emit();
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
    await db.resetAll();
    this.lastDiscovery = null;
    this.selectedRegionId = null;
    await this.load();
  }

  /** Regions containing a point, smallest first. */
  regionsAt(p: LatLng): Region[] {
    const x = lonToX(p.longitude);
    const y = latToY(p.latitude);
    return this.regions
      .filter((r) => shapeContains(r.shape, x, y))
      .sort((a, b) => a.totalCells - b.totalCells);
  }

  /**
   * Looks up the boundaries around the user when they're somewhere we don't
   * have a neighbourhood or city for yet. Throttled to be gentle on the
   * boundary service.
   */
  private async maybeDiscover(p: LatLng) {
    if (this.discovering) return;
    const covered = this.regionsAt(p).some((r) => r.level === 'neighbourhood' || r.level === 'city');
    if (covered) return;
    const last = this.lastDiscovery;
    if (last && Date.now() - last.time < 120_000 && distanceMeters(last.at, p) < 500) return;

    this.discovering = true;
    this.lastDiscovery = { at: p, time: Date.now() };
    this.emit();
    try {
      await this.addRegions(await regionsAt(p.latitude, p.longitude));
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    } finally {
      this.discovering = false;
      this.emit();
    }
  }

  private defaultSelection(): string | null {
    // Prefer the city: big enough to be a goal, small enough to make progress.
    const here = this.position ? this.regionsAt(this.position) : this.regions;
    return (here.find((r) => r.level === 'city') ?? here[0] ?? this.regions[0])?.id ?? null;
  }
}

export const store = new ExplorationStore();

/** Re-renders the component whenever the store changes. */
export function useStore(): ExplorationStore {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
