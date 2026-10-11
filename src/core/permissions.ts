/**
 * What to do when the player turns on background exploring, given the
 * current location permissions. Kept free of native code so it can be
 * tested; services/tracking.ts feeds it real permission responses.
 */
export type PermissionState = { granted: boolean; canAskAgain: boolean };

export type BackgroundStep =
  /** Already allowed "Always": start straight away. */
  | 'start'
  /** Explain first, then show the system prompt. */
  | 'explain'
  /** The system won't ask again; the player has to change it in Settings. */
  | 'openSettings';

export function backgroundStep(foreground: PermissionState, background: PermissionState): BackgroundStep {
  if (foreground.granted && background.granted) return 'start';
  // Background access needs foreground access first; either can be blocked.
  if (!foreground.granted && !foreground.canAskAgain) return 'openSettings';
  if (!background.granted && !background.canAskAgain && foreground.granted) return 'openSettings';
  return 'explain';
}
