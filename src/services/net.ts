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
 * Backoff after requests get no answer. On a weak signal (mountains, deep
 * woods) every attempt keeps the radio at full power until it times out, so
 * after a failure further requests wait: 15 s, doubling to 10 min. Any answer
 * from a server resets it; regaining signal allows one immediate retry.
 */
export const BACKOFF = { startMs: 15_000, maxMs: 10 * 60_000 };
let failures = 0;
let pausedUntil = 0;

function noteNoAnswer() {
  failures++;
  pausedUntil = Date.now() + Math.min(BACKOFF.maxMs, BACKOFF.startMs * 2 ** (failures - 1));
}

function noteAnswer() {
  failures = 0;
  pausedUntil = 0;
}

/** When requests may be tried again after a failure (0 if they may now). */
export function backoffEndsAt(): number {
  return pausedUntil;
}

/** For tests. */
export function resetBackoff() {
  noteAnswer();
}

/**
 * Fetches and reads a response within `timeoutMs`, including the body:
 * on a weak signal the headers can arrive long before the data does.
 * Fails fast without touching the network while offline or backing off.
 */
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  if (!online) throw new NetworkError('No connection');
  if (Date.now() < pausedUntil) throw new NetworkError('Waiting for a better signal');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    noteAnswer();
    return await read(res);
  } catch (e) {
    if (e instanceof HttpError || e instanceof NetworkError) throw e;
    if (e instanceof SyntaxError && !controller.signal.aborted) throw e;
    // No answer at all, or the body never finished: back off.
    noteNoAnswer();
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
  // Signal is back: allow one try now (failures still count, so a flapping
  // connection keeps backing off).
  if (online) pausedUntil = 0;
  listeners.forEach((fn) => fn(online));
}

/** Starts following the device's connectivity. Returns a stop function. */
export function startNetworkMonitor(): () => void {
  Network.getNetworkStateAsync().then(update, () => undefined);
  const sub = Network.addNetworkStateListener(update);
  return () => sub.remove();
}
