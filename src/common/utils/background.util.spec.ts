import { describe, expect, it, vi } from 'vitest';
import { runInBackground } from './background.util.js';

describe('runInBackground', () => {
  it('does not throw for a resolved task', () => {
    expect(() => runInBackground(Promise.resolve())).not.toThrow();
  });

  it('swallows task rejections instead of crashing (no unhandled rejection)', async () => {
    runInBackground(
      Promise.reject(new Error('background boom')),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vi.fn()).toHaveBeenCalledTimes(0);
  });
});
