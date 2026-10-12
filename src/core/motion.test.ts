import { describe, expect, it } from 'vitest';

import { INITIAL_MOTION, MotionState, nextMotion } from './motion';
import type { Fix } from './reveal';

const start = { latitude: 46.85, longitude: -121.76 };
const metersNorth = (m: number) => start.latitude + m / 111_195;
const fix = (northM: number, seconds: number, accuracy = 8): Fix => ({
  latitude: metersNorth(northM),
  longitude: start.longitude,
  timestamp: seconds * 1000,
  accuracy,
});
const run = (fixes: Fix[], state: MotionState = INITIAL_MOTION) => fixes.reduce(nextMotion, state);

describe('motion', () => {
  it('stays in full GPS while walking', () => {
    const walk = Array.from({ length: 60 }, (_, i) => fix(i * 20, i * 15)); // 20 m every 15 s
    expect(run(walk).mode).toBe('moving');
  });

  it('saves battery after standing still for a few minutes', () => {
    const lunch = Array.from({ length: 20 }, (_, i) => fix((i % 3) * 5, i * 15)); // jitter within 10 m
    expect(run(lunch.slice(0, 8)).mode).toBe('moving'); // under 3 minutes
    expect(run(lunch).mode).toBe('still');
  });

  it('ignores low-power jitter but wakes up when you walk off', () => {
    const still = run(Array.from({ length: 20 }, (_, i) => fix(0, i * 15)));
    expect(still.mode).toBe('still');
    expect(nextMotion(still, fix(60, 400, 65)).mode).toBe('still'); // within twice the error
    expect(nextMotion(still, fix(200, 400, 65)).mode).toBe('moving');
    expect(nextMotion(still, fix(90, 400, 20)).mode).toBe('moving');
  });

  it('wakes up after a big move even with cell-tower accuracy', () => {
    const still = run(Array.from({ length: 20 }, (_, i) => fix(0, i * 15)));
    expect(nextMotion(still, fix(250, 400, 1500)).mode).toBe('still');
    expect(nextMotion(still, fix(400, 400, 1500)).mode).toBe('moving');
  });

  it('saves battery indoors, where fixes drift by tens of metres', () => {
    // Accuracy ~60 m, positions wandering up to 50 m from the first one.
    const indoors = Array.from({ length: 20 }, (_, i) => fix((i % 4) * 15 - 10, i * 15, 60));
    expect(run(indoors).mode).toBe('still');
  });

  it('treats a reported walking speed as moving, even without distance yet', () => {
    const stood = run(Array.from({ length: 20 }, (_, i) => fix(0, i * 15)));
    expect(stood.mode).toBe('still');
    expect(nextMotion(stood, { ...fix(5, 400), speed: 1.5 }).mode).toBe('moving');
    // A slow GPS speed blip while standing doesn't count.
    expect(nextMotion(stood, { ...fix(5, 400), speed: 0.4 }).mode).toBe('still');
  });

  it('keeps full GPS while really walking with rough fixes', () => {
    const walk = Array.from({ length: 30 }, (_, i) => fix(i * 20, i * 15, 60)); // 20 m every 15 s
    expect(run(walk).mode).toBe('moving');
  });
});
