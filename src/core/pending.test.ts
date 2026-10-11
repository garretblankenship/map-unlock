import { describe, expect, it } from 'vitest';

import { PENDING_SETTINGS, addPendingPlace, removePendingPlace } from './pending';

const trailhead = { latitude: 46.85, longitude: -121.76 };
const north = (p: typeof trailhead, meters: number) => ({ ...p, latitude: p.latitude + meters / 111_195 });

describe('pending places', () => {
  it('queues points spaced at least the minimum apart', () => {
    let list = addPendingPlace([], trailhead);
    list = addPendingPlace(list, north(trailhead, 300));
    expect(list).toHaveLength(1);
    list = addPendingPlace(list, north(trailhead, 1500));
    expect(list).toHaveLength(2);
  });

  it('drops the oldest points past the cap', () => {
    let list: { latitude: number; longitude: number }[] = [];
    for (let i = 0; i < PENDING_SETTINGS.maxPoints + 5; i++) list = addPendingPlace(list, north(trailhead, i * 2000));
    expect(list).toHaveLength(PENDING_SETTINGS.maxPoints);
    expect(list[0]).toEqual(north(trailhead, 5 * 2000));
  });

  it('removes a point once it has been looked up', () => {
    const far = north(trailhead, 5000);
    const list = addPendingPlace(addPendingPlace([], trailhead), far);
    expect(removePendingPlace(list, trailhead)).toEqual([far]);
  });
});
