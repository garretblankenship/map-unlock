import type { Fix } from './reveal';
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
  /** Staying within this distance (or the fixes' own error, up to maxNoiseMeters) counts as standing still. */
  stillRadiusMeters: 30,
  /** ...for at least this long. */
  stillAfterMs: 3 * 60_000,
  /** Indoors, fixes wander by tens of metres; noise up to this is still "standing still". */
  maxNoiseMeters: 100,
  /** Low-power fixes are rough; only a move this big (or twice their error) wakes GPS up. */
  wakeRadiusMeters: 75,
  /** Reported speed above this means moving, whatever the positions say (m/s, a slow walk). */
  movingSpeedMps: 1.2,
};

export const INITIAL_MOTION: MotionState = { mode: 'moving', anchor: null, since: 0 };

export function nextMotion(state: MotionState, fix: Fix): MotionState {
  const { stillRadiusMeters, stillAfterMs, maxNoiseMeters, wakeRadiusMeters, movingSpeedMps } = MOTION_SETTINGS;
  const here = { latitude: fix.latitude, longitude: fix.longitude };
  const accuracy = fix.accuracy ?? 0;
  const fast = fix.speed != null && fix.speed > movingSpeedMps && accuracy <= maxNoiseMeters;
  const moved = (): MotionState => ({ mode: 'moving', anchor: here, since: fix.timestamp });

  if (!state.anchor) return moved();
  const distance = distanceMeters(state.anchor, here);

  if (state.mode === 'still') {
    return fast || distance > Math.max(wakeRadiusMeters, 2 * accuracy) ? moved() : state;
  }

  // Moving: a fix within its own error of where the stay began is consistent
  // with standing still, even indoors where fixes drift.
  const tolerance = Math.max(stillRadiusMeters, Math.min(accuracy, maxNoiseMeters));
  if (fast || distance > tolerance) return moved();
  return fix.timestamp - state.since >= stillAfterMs ? { ...state, mode: 'still' } : state;
}
