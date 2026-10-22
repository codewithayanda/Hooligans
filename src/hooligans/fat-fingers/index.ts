import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { LIMITS } from '../../guardrails/caps.js';
import { clumsyFor } from '../../payloads/clumsy.js';
import { cleanupMarker } from '../../util/workspace.js';
import {
  attempt,
  buildRequest,
  describeLeft,
  findTargets,
  FuzzBudget,
  kindOf,
  type FuzzTarget,
} from '../_shared/fuzz.js';
import { identity } from '../_shared/identity.js';
import { problemFinding, type Problem } from './findings.js';
import { react } from './reaction.js';

const MAX_REQUESTS = 60;
const MAX_FINDINGS = 10;

type Tools = {
  context: HooliganContext;
  marker: string;
  budget: FuzzBudget;
  problems: Problem[];
  notes: string[];
};

/** Types clumsy input into one form, a field at a time. False means there is no point going on. */
async function typeInto(target: FuzzTarget, tools: Tools): Promise<boolean> {
  const { context, marker, budget, problems, notes } = tools;
  if (!budget.take()) return false;

  const ordinary = buildRequest(target, marker);
  const baseline = react(await attempt(context.http, ordinary));
  budget.record(baseline.kind === 'fine');

  if (baseline.kind !== 'fine') {
    notes.push(
      `Fat Fingers left ${target.method} ${target.path} alone, because it did not answer an ordinary request properly.`,
    );
    return !budget.stopped;
  }

  for (const field of target.fields) {
    for (const input of clumsyFor(kindOf(field))) {
      if (!budget.take()) return false;

      const request = buildRequest(target, marker, { name: field.name, value: input.value() });
      const trouble = react(await attempt(context.http, request));
      budget.record(trouble.kind === 'fine');
      if (trouble.kind === 'fine') continue;

      if (trouble.kind === 'down') {
        const again = react(await attempt(context.http, ordinary));
        if (again.kind === 'fine') continue;
      }

      problems.push({ target, field: field.name, input, trouble });
      if (trouble.kind === 'down') return false;
      break;
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
    problems: [],
    notes: [],
  };

  for (const target of targets) {
    if (!(await typeInto(target, tools))) break;
  }

  const { budget, notes, problems } = tools;
  if (targets.length === 0) notes.push('Fat Fingers found no form or search field it could type into.');
  if (budget.broken) notes.push('Fat Fingers stopped early, because the app kept failing.');
  else if (budget.exhausted) notes.push(`Fat Fingers stopped after ${MAX_REQUESTS} requests.`);

  const leftOut = describeLeft('Fat Fingers', left);
  const findings: Finding[] = problems
    .slice(0, MAX_FINDINGS)
    .map((problem) => problemFinding(context.map, problem));

  return {
    findings,
    notLookedAt: [
      `Fat Fingers types odd values into the forms and search fields the Scout saw, one field at a time, and leaves junk data marked with ${marker}. It checks what comes straight back, not what the app does with the data later.`,
      ...(leftOut ? [leftOut] : []),
      ...notes,
    ],
  };
}

export const fatFingers: Hooligan = {
  ...identity('fat-fingers'),
  sessions: 0,
  requestsPerSecond: LIMITS.fuzz.requestsPerSecond,
  run,
};
