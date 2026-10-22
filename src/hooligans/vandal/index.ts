import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { LIMITS } from '../../guardrails/caps.js';
import { SQL_PROBES } from '../../payloads/sql-probes.js';
import { XSS_PROBES } from '../../payloads/xss.js';
import { cleanupMarker } from '../../util/workspace.js';
import {
  attempt,
  buildRequest,
  describeLeft,
  findTargets,
  FuzzBudget,
  type FuzzTarget,
} from '../_shared/fuzz.js';
import { identity } from '../_shared/identity.js';
import { strikeFinding, type Strike } from './findings.js';
import { cameBackAsMarkup } from './reflected.js';
import { findSqlError } from './sql-errors.js';

const MAX_REQUESTS = 60;
const MAX_FINDINGS = 10;

type Tools = {
  context: HooliganContext;
  marker: string;
  budget: FuzzBudget;
  strikes: Strike[];
  notes: string[];
};

/** Tries the harmless probes on every field of one form. False means there is no point going on. */
async function strikeAt(target: FuzzTarget, tools: Tools): Promise<boolean> {
  const { context, marker, budget, strikes, notes } = tools;
  if (!budget.take()) return false;

  const ordinary = await attempt(context.http, buildRequest(target, marker));
  budget.record(ordinary.kind === 'answer');

  if (ordinary.kind !== 'answer' || ordinary.response.status >= 500) {
    notes.push(
      `Vandal left ${target.method} ${target.path} alone, because it did not answer an ordinary request properly.`,
    );
    return !budget.stopped;
  }

  const alreadyShowsErrors = findSqlError(ordinary.response.body) !== null;

  for (const field of target.fields) {
    for (const probe of XSS_PROBES) {
      if (!budget.take()) return false;

      const value = probe.value(marker);
      const request = buildRequest(target, marker, { name: field.name, value });
      const result = await attempt(context.http, request);
      budget.record(result.kind === 'answer');

      if (result.kind === 'answer' && cameBackAsMarkup(result.response, value)) {
        strikes.push({ kind: 'reflected', target, field: field.name });
        break;
      }
    }

    if (alreadyShowsErrors) continue;

    for (const probe of SQL_PROBES) {
      if (!budget.take()) return false;

      const request = buildRequest(target, marker, { name: field.name, value: probe.value() });
      const result = await attempt(context.http, request);
      budget.record(result.kind === 'answer');

      const error = result.kind === 'answer' ? findSqlError(result.response.body) : null;
      if (error) {
        strikes.push({ kind: 'sql', target, field: field.name, error });
        break;
      }
    }
  }

  return !budget.stopped;
}

async function run(context: HooliganContext): Promise<HooliganResult> {
  const { targets, left } = findTargets(context.map, context.includeRisky);
  const marker = cleanupMarker(context.runId);
  const tools: Tools = {
    context,
    marker,
    budget: new FuzzBudget(MAX_REQUESTS),
    strikes: [],
    notes: [],
  };

  for (const target of targets) {
    if (!(await strikeAt(target, tools))) break;
  }

  const { budget, notes, strikes } = tools;
  if (targets.length === 0) notes.push('Vandal found no form or search field it could type into.');
  if (budget.broken) notes.push('Vandal stopped early, because the app kept failing.');
  else if (budget.exhausted) notes.push(`Vandal stopped after ${MAX_REQUESTS} requests.`);

  const leftOut = describeLeft('Vandal', left);
  const findings: Finding[] = strikes
    .slice(0, MAX_FINDINGS)
    .map((strike) => strikeFinding(context.map, strike));

  return {
    findings,
    notLookedAt: [
      `Vandal types harmless markers and stray quotes into the forms and search fields the Scout saw, and leaves junk data marked with ${marker}. It checks whether they come straight back as markup or as a database error. It does not check input that is stored and shown on a later page.`,
      ...(leftOut ? [leftOut] : []),
      ...notes,
    ],
  };
}

export const vandal: Hooligan = {
  ...identity('vandal'),
  sessions: 0,
  requestsPerSecond: LIMITS.fuzz.requestsPerSecond,
  run,
};
