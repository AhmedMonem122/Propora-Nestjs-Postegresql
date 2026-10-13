import { Logger } from '@nestjs/common';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { runInBackground } from './background.util.js';

describe('runInBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw for a resolved task', () => {
    expect(() => runInBackground(Promise.resolve())).not.toThrow();
  });

  it('logs (not crashes on) task rejections — never an unhandled rejection', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    runInBackground(Promise.reject(new Error('background boom')));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Background task failed'),
    );
  });
});
