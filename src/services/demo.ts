import { LatLng } from '../core/tiles';
import { store } from '../state/store';
import { ingestFixes } from './tracking';

/**
 * Simulated jog for trying the app without leaving the couch (development
 * builds only). Wanders along a grid-like path from the current position.
 */
let timer: ReturnType<typeof setInterval> | null = null;

export function startDemoWalk(from: LatLng) {
  stopDemoWalk();
  store.demoActive = true;
  let { latitude, longitude } = from;
  let heading = Math.floor(Math.random() * 4);
  let stepsLeft = 20;
  timer = setInterval(() => {
    if (--stepsLeft <= 0) {
      heading = (heading + (Math.random() < 0.5 ? 1 : 3)) % 4;
      stepsLeft = 10 + Math.floor(Math.random() * 30);
    }
    const meters = 8;
    const dLat = meters / 111_320;
    const dLon = meters / (111_320 * Math.cos((latitude * Math.PI) / 180));
    latitude += [dLat, 0, -dLat, 0][heading];
    longitude += [0, dLon, 0, -dLon][heading];
    store.setPosition({ latitude, longitude });
    void ingestFixes([{ latitude, longitude, timestamp: Date.now(), accuracy: 5, speed: null }]);
  }, 1500);
}

export function stopDemoWalk() {
  if (timer) clearInterval(timer);
  timer = null;
  store.demoActive = false;
}
