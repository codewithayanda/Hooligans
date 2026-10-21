import { launchBrowser } from '../../src/scout/browser.js';

/**
 * True when the tests that need a real browser should be skipped, after saying why. Where
 * HOOLIGANS_REQUIRE_BROWSER is 1, as in CI, they run anyway and fail loudly if there is no browser.
 */
export async function shouldSkipBrowserTests(label: string): Promise<boolean> {
  try {
    const { browser } = await launchBrowser();
    await browser.close();
    return false;
  } catch (error) {
    if (process.env.HOOLIGANS_REQUIRE_BROWSER === '1') return false;

    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`${label} are skipped because no browser could be started:\n${reason}`);
    return true;
  }
}
