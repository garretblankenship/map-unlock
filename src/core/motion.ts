import type { Fix } from './reveal';
import { REVEAL_SETTINGS } from './reveal';
import { distanceMeters } from './tiles';

/**
 * Battery saving for background tracking. While you're moving, GPS runs at
 * full accuracy. Once you've stayed within a small area for a few minutes
 * (a lunch stop, a campsite, home) it drops to low-power location, and it
 * goes back to full GPS once you've clearly moved on. Gap filling in
 * reveal.ts keeps the trail continuous across the switch.
 */
export type MotionMode = 'moving' | 'still';

export type MotionState = {
  mode: MotionMode;
  /** Where the current stay began (or the last low-power position). */
  anchor: { latitude: number; longitude: number } | null;
  /** When the player arrived within STILL_RADIUS of the anchor. */
  since: number;
};

export const MOTION_SETTINGS = {
  /** Staying within this distance counts as standing still. */
  stillRadiusMeters: 30,
  /** ...for at least this long. */
  stillAfterMs: 3 * 60_000,
  /** Low-power fixes are rough; only a move this big (or twice their error) wakes GPS up. */
  wakeRadiusMeters: 75,
};

export const INITIAL_MOTION: MotionState = { mode: 'moving', anchor: null, since: 0 };

export function nextMotion(state: MotionState, fix: Fix): MotionState {
  const { stillRadiusMeters, stillAfterMs, wakeRadiusMeters } = MOTION_SETTINGS;
  const here = { latitude: fix.latitude, longitude: fix.longitude };

  if (state.mode === 'still') {
    if (!state.anchor) return { mode: 'moving', anchor: here, since: fix.timestamp };
    const threshold = Math.max(wakeRadiusMeters, 2 * (fix.accuracy ?? 0));
    return distanceMeters(state.anchor, here) > threshold
      ? { mode: 'moving', anchor: here, since: fix.timestamp }
      : state;
  }

  // Moving: rough fixes can't tell standing from walking, so they don't count.
  if (fix.accuracy != null && fix.accuracy > REVEAL_SETTINGS.maxAccuracyMeters) return state;
  if (!state.anchor || distanceMeters(state.anchor, here) > stillRadiusMeters) {
    return { mode: 'moving', anchor: here, since: fix.timestamp };
  }
  return fix.timestamp - state.since >= stillAfterMs ? { ...state, mode: 'still' } : state;
}
