import type { BrowserContext } from 'playwright-core';
import type { BrowserGuard } from '../guardrails/egress/browser.js';

/** Puts the guard in front of every request a browser context makes. Refused requests are logged. */
export async function guardContext(context: BrowserContext, guard: BrowserGuard): Promise<void> {
  await context.route('**/*', async (route) => {
    const request = route.request();

    try {
      const decision = await guard.decide(new URL(request.url()));

      if (!decision.allowed) {
        guard.noteBlocked(request.method(), request.url(), decision.reason);
        await route.abort('blockedbyclient');
        return;
      }

      await route.continue();
    } catch {
      await route.abort('failed').catch(() => undefined);
    }
  });
}
