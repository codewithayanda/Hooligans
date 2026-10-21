import { resolveSeconds, resolveUsers } from '../guardrails/caps.js';
import { SEVERITIES, type Severity } from './finding.js';
import { rosterEntry } from './roster.js';
import { STAGE_NUMBERS, type Stage } from './stage.js';

/** The flags of `hooligans scan`, as the command line hands them over. */
export type RawScanOptions = {
  url: string;
  only?: string;
  stages?: string;
  yes?: boolean;
  allowHost?: string[];
  includeRisky?: boolean;
  load?: string;
  duration?: string;
  json?: boolean;
  failOn?: string;
  open?: boolean;
};

/** What a scan was asked to do, checked and with the defaults filled in. */
export type ScanConfig = {
  url: string;
  /** Hooligan ids. Empty means every hooligan. */
  only: string[];
  /** Stage 1 is always in here. */
  stages: Stage[];
  yes: boolean;
  allowHosts: string[];
  includeRisky: boolean;
  users: number;
  seconds: number;
  json: boolean;
  failOn: Severity | null;
  open: boolean;
};

export type ConfigResult = { ok: true; config: ScanConfig } | { ok: false; error: string };

function fail(error: string): ConfigResult {
  return { ok: false, error };
}

function words(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function parseStages(text: string): Stage[] | null {
  const wanted = new Set<Stage>([1]);

  for (const word of words(text)) {
    const stage = STAGE_NUMBERS.find((candidate) => String(candidate) === word);
    if (stage === undefined) return null;
    wanted.add(stage);
  }

  return STAGE_NUMBERS.filter((stage) => wanted.has(stage));
}

/** Nothing given is undefined, and something that is not a number is null. */
function parseNumber(text: string | undefined): number | undefined | null {
  if (text === undefined) return undefined;

  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) ? value : null;
}

export function parseScanOptions(raw: RawScanOptions): ConfigResult {
  const stages = parseStages(raw.stages ?? '1,2,3,4');
  if (!stages) return fail('--stages takes numbers from 1 to 4, for example --stages 1,2.');

  const only = words(raw.only ?? '').map((word) => word.toLowerCase());
  for (const id of only) {
    if (!rosterEntry(id)) {
      return fail(`"${id}" is not a hooligan. Run hooligans list to see them.`);
    }
  }

  const load = parseNumber(raw.load);
  if (load === null) return fail('--load takes a number of users, for example --load 50.');

  const duration = parseNumber(raw.duration);
  if (duration === null) {
    return fail('--duration takes a number of seconds, for example --duration 30.');
  }

  let failOn: Severity | null = null;
  if (raw.failOn !== undefined) {
    const wanted = raw.failOn.toLowerCase();
    const severity = SEVERITIES.find((candidate) => candidate === wanted);
    if (!severity) return fail(`--fail-on takes one of ${SEVERITIES.join(', ')}.`);
    failOn = severity;
  }

  return {
    ok: true,
    config: {
      url: raw.url,
      only: [...new Set(only)],
      stages,
      yes: raw.yes === true,
      allowHosts: raw.allowHost ?? [],
      includeRisky: raw.includeRisky === true,
      users: resolveUsers(load),
      seconds: resolveSeconds(duration),
      json: raw.json === true,
      failOn,
      open: raw.open === true,
    },
  };
}
