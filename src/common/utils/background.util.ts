import { Logger } from '@nestjs/common';

const logger = new Logger('Background');

/**
 * Runs a promise after the HTTP response without blocking it.
 *
 * On Vercel, `waitUntil()` extends the function lifetime so background
 * work (welcome emails, webhook fan-out, realtime pushes) actually
 * completes instead of being frozen mid-flight. Any failure is logged,
 * never thrown — the request that triggered the work already succeeded.
 *
 * Off Vercel (local/dev/test) the import or the call falls back to a
 * floating promise, which the running process completes normally.
 */
export function runInBackground(task: Promise<unknown>): void {
  // Guard FIRST: waitUntil() extends lifetime but does not consume the
  // rejection — without this handler a failing task becomes an unhandled
  // rejection (which fails test runs and litters serverless logs).
  const guarded = task.catch((error: unknown) => {
    logger.warn(
      `Background task failed: ${(error as Error)?.message ?? error}`,
    );
  });
  void extendLifetime(guarded);
}

async function extendLifetime(task: Promise<unknown>): Promise<void> {
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(task);
  } catch {
    // Not on Vercel (or waitUntil unavailable): the process outlives the
    // request here, so awaiting inline is equivalent. `task` is already
    // guarded above and cannot reject.
    await task;
  }
}
