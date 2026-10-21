import { chromium, type Browser, type LaunchOptions } from 'playwright-core';

export type BrowserChoice = {
  channel?: 'msedge' | 'chrome';
  executablePath?: string;
};

const LABELS = { msedge: 'Microsoft Edge', chrome: 'Google Chrome' } as const;

const ARGS = [
  '--disable-background-networking',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check',
];

function attemptsFor(choice: BrowserChoice): BrowserChoice[] {
  const executablePath = choice.executablePath ?? process.env.HOOLIGANS_BROWSER;

  if (executablePath) return [{ executablePath }];
  if (choice.channel) return [{ channel: choice.channel }];

  return process.platform === 'win32'
    ? [{ channel: 'msedge' }, { channel: 'chrome' }]
    : [{ channel: 'chrome' }, { channel: 'msedge' }];
}

function labelFor(attempt: BrowserChoice): string {
  return attempt.executablePath ?? (attempt.channel ? LABELS[attempt.channel] : 'a browser');
}

/** Starts the Edge or Chrome that is already installed. Nothing is downloaded. */
export async function launchBrowser(
  choice: BrowserChoice = {},
): Promise<{ browser: Browser; used: string }> {
  const problems: string[] = [];

  for (const attempt of attemptsFor(choice)) {
    const options: LaunchOptions = {
      headless: true,
      args: ARGS,
      ...(attempt.channel ? { channel: attempt.channel } : {}),
      ...(attempt.executablePath ? { executablePath: attempt.executablePath } : {}),
    };

    try {
      const browser = await chromium.launch(options);
      return { browser, used: labelFor(attempt) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${labelFor(attempt)}: ${message.split('\n')[0] ?? ''}`);
    }
  }

  throw new Error(
    [
      'Hooligans could not start a browser.',
      ...problems.map((problem) => `  ${problem}`),
      'Install Microsoft Edge or Google Chrome, or set HOOLIGANS_BROWSER to the path of one.',
      'If your computer is managed by an organisation, browser automation may be blocked by policy.',
    ].join('\n'),
  );
}
