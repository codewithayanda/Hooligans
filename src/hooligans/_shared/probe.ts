import type { HttpClient, HttpRequest, HttpResponse } from '../../core/context.js';
import { EgressError } from '../../guardrails/egress/gate.js';

export type ProbeOptions = Pick<HttpRequest, 'headers' | 'maxBodyBytes' | 'timeoutMs' | 'redirect'>;

/**
 * One read through the gate. A request that is refused or fails gives null, so a hooligan can
 * carry on. Running out of budget, or being stopped, is passed on so the whole scan stops too.
 */
export async function probe(
  http: HttpClient,
  url: string,
  options: ProbeOptions = {},
): Promise<HttpResponse | null> {
  try {
    return await http.request({ method: 'GET', url, ...options });
  } catch (error) {
    if (error instanceof EgressError && (error.kind === 'budget' || error.kind === 'aborted')) {
      throw error;
    }
    return null;
  }
}

/** A web page is what a catch-all route answers for any path, so it never counts as a file. */
export function isHtml(response: HttpResponse): boolean {
  return /html/i.test(response.headers['content-type'] ?? '');
}
