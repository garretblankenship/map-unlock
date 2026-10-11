import * as Network from 'expo-network';

/**
 * Network helpers for spotty connections (mountains, forests, rural roads).
 * Every request has a deadline so a stalled connection can't wedge a queue,
 * and callers can tell "no signal, try later" apart from real errors.
 */

/** The request never got an answer: offline, dropped, or too slow. Worth retrying later. */
export class NetworkError extends Error {}

/** The server answered with an error status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Whether a failure is likely to go away once the connection improves. */
export function isTransient(e: unknown): boolean {
  return e instanceof NetworkError || (e instanceof HttpError && (e.status === 429 || e.status >= 500));
}

/**
 * Fetches and reads a response within `timeoutMs`, including the body:
 * on a weak signal the headers can arrive long before the data does.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  if (!online) throw new NetworkError('No connection');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await read(await fetch(url, { ...init, signal: controller.signal }));
  } catch (e) {
    if (e instanceof HttpError || e instanceof NetworkError) throw e;
    if (e instanceof SyntaxError && !controller.signal.aborted) throw e;
    throw new NetworkError(controller.signal.aborted ? 'Connection too slow' : 'No connection');
  } finally {
    clearTimeout(timer);
  }
}

let online = true;
const listeners = new Set<(online: boolean) => void>();

export function isOnline(): boolean {
  return online;
}

/** Called whenever connectivity flips between online and offline. */
export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(state: Network.NetworkState) {
  // Unknown counts as online: better to try and time out than never try.
  const next = state.isInternetReachable ?? state.isConnected ?? true;
  if (next === online) return;
  online = next;
  listeners.forEach((fn) => fn(online));
}

/** Starts following the device's connectivity. Returns a stop function. */
export function startNetworkMonitor(): () => void {
  Network.getNetworkStateAsync().then(update, () => undefined);
  const sub = Network.addNetworkStateListener(update);
  return () => sub.remove();
}
