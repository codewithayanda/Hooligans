import type { HttpResponse } from '../../core/context.js';
import { isHtml } from '../_shared/probe.js';

/** True when a page shows the probe back exactly as it was typed, so a browser reads it as markup. */
export function cameBackAsMarkup(response: HttpResponse, probe: string): boolean {
  return isHtml(response) && response.body.includes(probe);
}
