import { describe, expect, it } from 'vitest';

import { backgroundStep } from './permissions';

const yes = { granted: true, canAskAgain: true };
const ask = { granted: false, canAskAgain: true };
const blocked = { granted: false, canAskAgain: false };

describe('backgroundStep', () => {
  it('starts when already allowed', () => expect(backgroundStep(yes, yes)).toBe('start'));
  it('explains before the first prompt', () => {
    expect(backgroundStep(yes, ask)).toBe('explain');
    expect(backgroundStep(ask, ask)).toBe('explain');
  });
  it('sends people to Settings once the system stops asking', () => {
    expect(backgroundStep(yes, blocked)).toBe('openSettings');
    expect(backgroundStep(blocked, ask)).toBe('openSettings');
  });
});
