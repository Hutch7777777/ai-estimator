/**
 * Reject a promise (or thenable, e.g. a supabase-js query builder) if it
 * hasn't settled within `ms`. Used by the app-shell data views so a read
 * that returns nothing (RLS, network black hole) surfaces an explicit error
 * state instead of an infinite spinner.
 */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

export const DEFAULT_READ_TIMEOUT_MS = 10_000;

export function withTimeout<T>(
  thenable: Promise<T> | PromiseLike<T>,
  ms: number = DEFAULT_READ_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    Promise.resolve(thenable).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
