import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultCaps, ScanBudget } from '../guardrails/caps.js';
import { gatherConsent } from '../guardrails/consent.js';
import { BrowserGuard } from '../guardrails/egress/browser.js';
import { EgressError, EgressGate, type ClientOptions } from '../guardrails/egress/gate.js';
import { createRequestLog } from '../guardrails/egress/request-log.js';
import { checkTarget, scopeFor } from '../guardrails/scope.js';
import { buildReport } from '../report/build.js';
import { serializeReport } from '../report/json.js';
import { renderHtml } from '../report/render.js';
import type { CaptureOptions } from '../scout/capture.js';
import { isBackendHost } from '../scout/fingerprint.js';
import { AppNotReachable } from '../scout/reach.js';
import type { ScoutOptions } from '../scout/scout.js';
import { cleanText } from '../util/text.js';
import { cleanupMarker, newRunId, runDirectory } from '../util/workspace.js';
import type { AppMap } from './app-map.js';
import type { ScanConfig } from './config.js';
import type { Submission, SubmitCapture } from './context.js';
import { SEVERITIES, type Finding, type Severity } from './finding.js';
import type { Hooligan } from './hooligan.js';
import type { LoadSummary, Report } from './report.js';
import { HOOLIGANS_IN_V01, ROSTER, rosterEntry } from './roster.js';
import { STAGE_NUMBERS } from './stage.js';

export type Progress = { step(text: string): void };

export type ScanDeps = {
  /** Every hooligan that is built, in the order they run inside a stage. */
  registry: readonly Hooligan[];
  /** Maps the app. The real one drives a browser, tests hand over a map. */
  scout: (options: ScoutOptions) => Promise<AppMap>;
  /** Submits a login form once in a browser, for Brute. Tests leave it out. */
  capture?: (options: CaptureOptions) => Promise<Submission | null>;
  /** Asks a yes or no question. Without a terminal it answers no. */
  ask: (question: string) => Promise<boolean>;
  progress: Progress;
  /** Where .hooligans is written. */
  cwd: string;
  version: string;
  now?: () => Date;
  /** Aborted when the user presses Ctrl+C. */
  signal?: AbortSignal;
  runId?: string;
  /** Replaces the pace each hooligan asks for. Tests use it so the demo does not slow them down. */
  requestsPerSecond?: number;
};

export type ScanOutcome =
  | { kind: 'stopped'; exitCode: 2 | 3 | 130; message: string }
  | {
      kind: 'done';
      exitCode: 0 | 1 | 130;
      report: Report;
      directory: string;
      htmlPath: string;
      jsonPath: string;
    };

type Selection =
  { ok: true; selected: Hooligan[]; notBuilt: Report['skipped'] } | { ok: false; error: string };

const ALWAYS_NOT_LOOKED_AT = [
  'Anything behind a login. Hooligans has no saved login yet.',
  'Anything behind a button. The Scout only follows links.',
  'What your own server does with the requests it receives, such as calls to Stripe or OpenAI.',
  'Whether the database behind the app holds real customer data.',
];

function stopped(exitCode: 2 | 3 | 130, message: string): ScanOutcome {
  return { kind: 'stopped', exitCode, message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(error: unknown): string {
  return cleanText(messageOf(error).split('\n')[0] ?? '', 200);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Which hooligans this scan runs, and which version 0.1 hooligans do not exist yet. */
function select(config: ScanConfig, registry: readonly Hooligan[]): Selection {
  const built = new Map(registry.map((hooligan): [string, Hooligan] => [hooligan.id, hooligan]));

  if (config.only.length > 0) {
    for (const id of config.only) {
      const hooligan = built.get(id);
      const name = rosterEntry(id)?.name ?? id;

      if (!hooligan) return { ok: false, error: `${name} is not built yet.` };
      if (!config.stages.includes(hooligan.stage)) {
        return {
          ok: false,
          error: `${name} belongs to stage ${hooligan.stage}, which --stages leaves out.`,
        };
      }
    }

    const selected = registry.filter((hooligan) => config.only.includes(hooligan.id));
    return { ok: true, selected, notBuilt: [] };
  }

  const notBuilt = ROSTER.filter(
    (entry) => entry.since === '0.1' && config.stages.includes(entry.stage) && !built.has(entry.id),
  ).map((entry) => ({ id: entry.id, reason: 'Not built yet.' }));

  const selected = registry.filter((hooligan) => config.stages.includes(hooligan.stage));
  return { ok: true, selected, notBuilt };
}

/** The gaps every run has, what the Scout left alone, and what each hooligan said it missed. */
function describeGaps(map: AppMap, fromHooligans: readonly string[]): string[] {
  const gaps = [...ALWAYS_NOT_LOOKED_AT];
  const left = map.coverage.skipped;

  if (left.length > 0) {
    const shown = left.slice(0, 3);
    if (left.length > 3) shown.push(`and ${left.length - 3} more`);
    gaps.push(`The Scout did not follow: ${shown.join('; ')}.`);
  }

  return [...gaps, ...new Set(fromHooligans)];
}

/** True when a counted finding is at or above the severity that --fail-on asked about. */
function failsThreshold(report: Report, failOn: Severity | null): boolean {
  if (failOn === null) return false;

  const limit = SEVERITIES.indexOf(failOn);
  return report.findings.some((finding) => SEVERITIES.indexOf(finding.severity) <= limit);
}

/**
 * One scan from start to finish: check the target, map the app, ask for consent, run the
 * hooligans stage by stage and write the report. Problems come back as an outcome, not a throw.
 */
export async function runScan(config: ScanConfig, deps: ScanDeps): Promise<ScanOutcome> {
  const target = checkTarget(config.url);
  if (!target.allowed) return stopped(2, target.reason);

  const selection = select(config, deps.registry);
  if (!selection.ok) return stopped(2, selection.error);

  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const runId = deps.runId ?? newRunId(startedAt);
  const budget = new ScanBudget();

  const gates: EgressGate[] = [];
  const closeGates = (): void => {
    for (const gate of gates) gate.close();
  };
  deps.signal?.addEventListener('abort', closeGates, { once: true });

  try {
    const directory = runDirectory(deps.cwd, runId);
    const logPath = join(directory, 'requests.jsonl');
    writeFileSync(logPath, '');
    const log = createRequestLog(logPath);

    const scope = scopeFor(target.origin);
    const guard = new BrowserGuard({ scope, log });
    const scoutGate = new EgressGate({ scope, log });
    gates.push(scoutGate);

    deps.progress.step(`Looking around ${target.origin} with a real browser`);

    let map: AppMap;
    try {
      map = await deps.scout({ entry: target.url, scope, http: scoutGate.client('scout'), guard });
    } catch (error) {
      if (deps.signal?.aborted) return stopped(130, 'Stopped. No report was written.');
      if (error instanceof AppNotReachable) return stopped(2, error.message);

      const reason = cleanText(messageOf(error), 600);
      return stopped(3, `${reason}\nRun hooligans doctor to check that a browser can start.`);
    }

    deps.progress.step(
      `Mapped ${plural(map.pages.length, 'page')}, ${plural(map.forms.length, 'form')} and ${plural(map.calls.length, 'call')}`,
    );

    const consent = await gatherConsent({
      stages: STAGE_NUMBERS.filter((stage) =>
        selection.selected.some((hooligan) => hooligan.stage === stage),
      ),
      yes: config.yes,
      allowHosts: config.allowHosts,
      hostedBackends: map.externalHosts.filter(isBackendHost),
      ask: deps.ask,
    });

    const skipped: Report['skipped'] = [...selection.notBuilt];
    for (const { stage, reason } of consent.skippedStages) {
      for (const hooligan of selection.selected.filter((candidate) => candidate.stage === stage)) {
        skipped.push({ id: hooligan.id, reason });
      }
    }

    const gate = new EgressGate({ scope: scopeFor(target.origin, consent.confirmedHosts), log });
    gates.push(gate);

    const caps = { ...defaultCaps(), maxUsers: config.users, loadSeconds: config.seconds };

    const openBrowser = deps.capture;
    const capture: SubmitCapture | undefined = openBrowser
      ? (page, values) =>
          openBrowser({ guard, page, values, ...(deps.signal ? { signal: deps.signal } : {}) })
      : undefined;
    const sent = (): number => scoutGate.stats().sent + gate.stats().sent + guard.stats().allowed;

    const findings: Finding[] = [];
    const gaps: string[] = [];
    const ran: Hooligan[] = [];
    let load: LoadSummary | undefined;
    let interrupted = false;

    for (const stage of consent.stagesToRun) {
      for (const hooligan of selection.selected.filter((candidate) => candidate.stage === stage)) {
        if (deps.signal?.aborted) {
          interrupted = true;
          skipped.push({ id: hooligan.id, reason: 'Stopped with Ctrl+C.' });
          continue;
        }

        const exceeded = budget.exceeded(sent());
        if (exceeded) {
          skipped.push({ id: hooligan.id, reason: exceeded });
          continue;
        }

        deps.progress.step(`${hooligan.name}: ${hooligan.summary}`);

        try {
          const pace = deps.requestsPerSecond ?? hooligan.requestsPerSecond;
          const client: ClientOptions = {};
          if (pace !== undefined) client.requestsPerSecond = pace;
          if (hooligan.aggregateLog === true) client.aggregateLog = true;

          const result = await hooligan.run({
            runId,
            map,
            http: gate.client(hooligan.id, client),
            caps,
            confirmedHosts: consent.confirmedHosts,
            includeRisky: config.includeRisky,
            ...(capture ? { capture } : {}),
          });
          findings.push(
            ...result.findings.map((finding) => ({ ...finding, hooligan: hooligan.id })),
          );
          gaps.push(...(result.notLookedAt ?? []));
          if (result.load) load = result.load;
          ran.push(hooligan);
        } catch (error) {
          const byUser = error instanceof EgressError && error.kind === 'aborted';
          if (byUser) interrupted = true;

          skipped.push({
            id: hooligan.id,
            reason: byUser ? 'Stopped with Ctrl+C.' : `Stopped by an error: ${firstLine(error)}`,
          });
        }
      }
    }

    const writes = gate.stats().writes;
    const report = buildReport({
      tool: { name: 'hooligans', version: deps.version },
      run: {
        id: runId,
        startedAt: startedAt.toISOString(),
        finishedAt: now().toISOString(),
        target: target.origin,
        mode: map.mode,
        status: interrupted || ran.length < HOOLIGANS_IN_V01 ? 'partial' : 'complete',
        stagesRun: [...new Set(ran.map((hooligan) => hooligan.stage))].sort(),
      },
      findings,
      ran: ran.length,
      skipped,
      notLookedAt: describeGaps(map, gaps),
      ...(load ? { load } : {}),
      activity: {
        requestsSent: sent(),
        requestsBlocked: scoutGate.stats().blocked + gate.stats().blocked + guard.stats().blocked,
        writes,
        cleanupMarker: writes > 0 ? cleanupMarker(runId) : null,
      },
    });

    const jsonPath = join(directory, 'report.json');
    const htmlPath = join(directory, 'report.html');
    writeFileSync(join(directory, 'map.json'), `${JSON.stringify(map, null, 2)}\n`);
    writeFileSync(jsonPath, serializeReport(report));
    writeFileSync(htmlPath, renderHtml(report));

    const exitCode = interrupted ? 130 : failsThreshold(report, config.failOn) ? 1 : 0;
    return { kind: 'done', exitCode, report, directory, htmlPath, jsonPath };
  } catch (error) {
    return stopped(3, `Something went wrong: ${firstLine(error)}`);
  } finally {
    deps.signal?.removeEventListener('abort', closeGates);
    closeGates();
  }
}
