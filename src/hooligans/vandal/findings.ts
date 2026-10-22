import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { finish, safeToken } from '../_shared/finding.js';
import type { FuzzTarget } from '../_shared/fuzz.js';
import type { SqlError } from './sql-errors.js';

const HOOLIGAN = 'vandal';

export type Strike =
  | { kind: 'reflected'; target: FuzzTarget; field: string }
  | { kind: 'sql'; target: FuzzTarget; field: string; error: SqlError };

/** One input that did something it should not, as a finding. */
export function strikeFinding(map: AppMap, strike: Strike): Finding {
  const path = safeToken(strike.target.path, 100);
  const at = `${strike.target.method} ${path}`;
  const field = safeToken(strike.field, 40);

  if (strike.kind === 'reflected') {
    return finish(
      {
        id: 'vandal.reflected-input',
        hooligan: HOOLIGAN,
        title: `${at} shows what you type in "${field}" without cleaning it`,
        severity: 'high',
        category: 'security',
        confidence: 'high',
        rootCause: `vandal:${path}:${field}:reflected`,
        affected: [`${at} (${field})`],
        evidence: `A harmless marker typed into "${field}" of ${at} came back inside the page as raw HTML, not as text.`,
        fix: 'Escape user input wherever it is shown, or use the text binding of your framework instead of inserting HTML.',
        problem: `${at} puts the "${field}" value into the page as raw HTML.`,
        change: `Escape the "${field}" value wherever it is shown, or render it as plain text instead of inserting it as HTML. Do not use innerHTML, dangerouslySetInnerHTML, v-html or a template tag that turns escaping off for user input.`,
        keep: 'The page must still show the value that was typed, as text.',
      },
      map,
    );
  }

  return finish(
    {
      id: 'vandal.sql-error',
      hooligan: HOOLIGAN,
      title: `A stray quote in "${field}" makes ${at} show a database error`,
      severity: 'high',
      category: 'security',
      confidence: 'high',
      rootCause: `vandal:${path}:${field}:sql-error`,
      affected: [`${at} (${field})`],
      evidence: `A single stray quote typed into "${field}" of ${at} made the app show a ${strike.error.engine} error message: "${strike.error.snippet}".`,
      fix: "Never build a SQL query by joining text. Use parameterised queries or your ORM's query builder, and answer with a short plain error instead of the database message.",
      problem: `${at} shows a database error when the "${field}" value contains a quote, which suggests the query is built by joining text.`,
      change:
        'Rewrite the query behind this route to use parameters instead of putting the value into the SQL text, and catch database errors so the browser only sees a short plain message. Check the other queries that take user input in the same way.',
      keep: 'The route must return the same results for normal input.',
    },
    map,
  );
}
