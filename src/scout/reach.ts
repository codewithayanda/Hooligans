import type { HttpClient } from '../core/context.js';

/** The app did not answer, so there is nothing to scan. The message says why, in plain words. */
export class AppNotReachable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AppNotReachable';
  }
}

/** One read of the first page, so a stopped app fails in a second, before a browser starts. */
export async function assertReachable(http: HttpClient, entry: URL): Promise<void> {
  try {
    await http.request({
      method: 'GET',
      url: entry.href,
      maxBodyBytes: 64 * 1024,
      timeoutMs: 8_000,
    });
  } catch (error) {
    throw new AppNotReachable(error instanceof Error ? error.message : String(error));
  }
}
