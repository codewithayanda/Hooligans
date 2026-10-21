import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Report } from '../../core/report.js';
import { parseReport, serializeReport } from '../../report/json.js';
import { renderHtml } from '../../report/render.js';
import { buildSampleReport } from '../../report/sample.js';
import { openFile } from '../../util/open-file.js';
import {
  isValidRunId,
  listRunIds,
  newRunId,
  runDirectory,
  workspacePath,
} from '../../util/workspace.js';
import { formatSummary } from '../ui/summary.js';

type ReportOptions = { open?: boolean; run?: string; sample?: boolean };
type Written = { report: Report; htmlPath: string };

function fail(message: string): void {
  console.error(message);
  process.exitCode = 2;
}

function writeSample(cwd: string, version: string): Written {
  const runId = `${newRunId()}-sample`;
  const report = buildSampleReport({ runId, version });
  const directory = runDirectory(cwd, runId);

  writeFileSync(join(directory, 'report.json'), serializeReport(report));
  const htmlPath = join(directory, 'report.html');
  writeFileSync(htmlPath, renderHtml(report));

  return { report, htmlPath };
}

/** Rebuilds the HTML from the saved JSON, so template improvements reach old runs too. */
function rerender(cwd: string, runId: string): Written {
  const directory = join(workspacePath(cwd), 'runs', runId);
  const report = parseReport(readFileSync(join(directory, 'report.json'), 'utf8'));

  const htmlPath = join(directory, 'report.html');
  writeFileSync(htmlPath, renderHtml(report));

  return { report, htmlPath };
}

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Show the latest report, or a sample one.')
    .option('--open', 'open the HTML report in your browser')
    .option('--run <id>', 'a specific run instead of the latest')
    .option('--sample', 'build a sample report with made-up findings, to see what one looks like')
    .action((options: ReportOptions, command: Command) => {
      const cwd = process.cwd();
      let written: Written;

      try {
        if (options.sample) {
          written = writeSample(cwd, command.parent?.version() ?? '0.0.0');
        } else {
          const runId = options.run ?? listRunIds(cwd).at(-1);
          if (!runId) {
            return fail(
              'No reports yet. Try `hooligans report --sample` to see what one looks like.',
            );
          }
          if (!isValidRunId(runId)) return fail(`"${runId}" is not a valid run id.`);
          written = rerender(cwd, runId);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return fail(`Could not read that report: ${reason}`);
      }

      console.log(formatSummary(written.report, written.htmlPath));
      if (options.open) openFile(written.htmlPath);
    });
}
