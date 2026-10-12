/** An in-memory MapLibre OfflineManager holding saved map areas. */
type Bounds = [number, number, number, number];
type Pack = {
  id: string;
  bounds: Bounds;
  metadata: Record<string, unknown>;
  status: () => Promise<Record<string, unknown>>;
  resume: () => Promise<void>;
};

const packs = new Map<string, Pack>();

function pack(id: string, bounds: Bounds, metadata: Record<string, unknown>, complete: boolean): Pack {
  return {
    id,
    bounds,
    metadata,
    status: async () => ({
      id,
      state: complete ? 'complete' : 'inactive',
      percentage: complete ? 100 : 40,
      requiredResourceCount: 100,
      completedResourceCount: complete ? 100 : 40,
      completedResourceSize: complete ? 12_345_678 : 1_000_000,
      completedTileCount: 0,
      completedTileSize: 0,
    }),
    resume: async () => undefined,
  };
}

export const fakeOfflineManager = {
  packs,
  /** Puts a saved area on the "phone" before the app starts. */
  seed(id: string, name: string, bounds: Bounds, complete = true) {
    packs.set(id, pack(id, bounds, { name, createdAt: 1 }, complete));
  },
  setTileCountLimit: jest.fn(),
  setProgressEventThrottle: jest.fn(),
  setMaximumAmbientCacheSize: jest.fn(async () => undefined),
  getPacks: jest.fn(async () => [...packs.values()]),
  getPack: jest.fn(async (id: string) => packs.get(id) ?? null),
  createPack: jest.fn(async (options: { bounds: Bounds; metadata: Record<string, unknown> }) => {
    const p = pack(`pack-${packs.size + 1}`, options.bounds, options.metadata, false);
    packs.set(p.id, p);
    return p;
  }),
  deletePack: jest.fn(async (id: string) => void packs.delete(id)),
  addListener: jest.fn(),
  removeListener: jest.fn(),
};
