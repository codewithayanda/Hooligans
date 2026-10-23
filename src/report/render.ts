import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Finding } from '../core/finding.js';
import type { LoadLevel, Report, ScoredFinding } from '../core/report.js';
import { STAGES, type Stage } from '../core/stage.js';
import { buildMasterPrompt } from '../prompts/build.js';
import { cleanText, escapeHtml } from '../util/text.js';
import { SEVERITY_LABEL, dateLabel, describeLoad, headline, hooliganName } from './voice.js';

const TOP_COUNT = 5;
const TONES = ['nothing-serious', 'almost-there', 'risky', 'not-ready'];
const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const CHART_WIDTH = 640;
const CHART_LABEL = 96;
const CHART_BAR_MAX = 420;
const CHART_ROW = 30;
const CHART_ROWS = 14;

const COPY_SCRIPT = `
document.addEventListener('click', function (event) {
  var button = event.target instanceof Element ? event.target.closest('button[data-target]') : null;
  if (!button) return;
  var source = document.getElementById(button.getAttribute('data-target'));
  if (!source) return;
  var text = source.textContent || '';
  var label = button.textContent;
  function done() {
    button.textContent = 'Copied';
    setTimeout(function () { button.textContent = label; }, 1500);
  }
  function fallback() {
    var area = document.createElement('textarea');
    area.value = text;
    area.className = 'offscreen';
    document.body.appendChild(area);
    area.select();
    try {
      if (document.execCommand('copy')) done();
    } catch (error) {
      button.textContent = 'Select and copy by hand';
    }
    document.body.removeChild(area);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
});
`;

function readAsset(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

/** Everything that came from the app under test goes through here. */
function esc(text: string, max = 2000): string {
  return escapeHtml(cleanText(text, max));
}

function count(value: number): string {
  return String(Math.max(0, Math.round(Number(value) || 0)));
}

function toneOf(verdict: string): string {
  return TONES.includes(verdict) ? verdict : 'risky';
}

function chip(severity: string): string {
  const level = Object.hasOwn(SEVERITY_LABEL, severity)
    ? (severity as keyof typeof SEVERITY_LABEL)
    : 'low';
  return `<span class="chip chip-${level}">${SEVERITY_LABEL[level]}</span>`;
}

function pointsText(points: number): string {
  const safe = Math.max(0, Math.round(Number(points) || 0));
  if (safe === 0) return 'costs no points';
  return `costs ${safe} point${safe === 1 ? '' : 's'}`;
}

function stageLabel(stage: number): string {
  return Object.hasOwn(STAGES, stage) ? `${stage} (${STAGES[stage as Stage].name})` : String(stage);
}

function ring(value: number, verdict: string): string {
  const safe = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  const filled = ((safe / 100) * RING_LENGTH).toFixed(1);
  const whole = RING_LENGTH.toFixed(1);

  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Hooligan score ${safe} out of 100">
<circle class="ring-track" cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke-width="10"/>
<circle class="ring-value tone-${toneOf(verdict)}" cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${filled} ${whole}" transform="rotate(-90 60 60)"/>
<text class="ring-number" x="60" y="68" text-anchor="middle">${safe}</text>
</svg>`;
}

function pageHeader(report: Report): string {
  const banners: string[] = [];

  if (report.run.sample) {
    banners.push(
      'This is a sample report. The findings are made up to show what a report looks like.',
    );
  }
  if (report.run.mode === 'dev') {
    banners.push(
      'The app was running as a dev server. Findings about source maps and error pages can differ in production, and speed numbers show relative weak spots only. Run a production build for a truer picture.',
    );
  }

  const status = report.run.status === 'complete' ? 'complete run' : 'partial run';

  return `<header class="page-header">
<p class="brand">Hooligans</p>
<h1>Report for ${esc(report.run.target, 300)}</h1>
<p class="meta">${esc(dateLabel(report.run.finishedAt), 60)} &middot; Hooligans ${esc(report.tool.version, 40)} &middot; ${status}</p>
${banners.map((text) => `<p class="banner">${esc(text, 600)}</p>`).join('\n')}
</header>`;
}

function scoreCard(report: Report): string {
  const { score } = report;

  return `<section class="score-card" aria-labelledby="score-title">
${ring(score.value, score.verdict)}
<div>
<h2 id="score-title">Hooligan score</h2>
<p class="verdict tone-${toneOf(score.verdict)}">${esc(score.label, 200)}</p>
<p class="headline">${esc(headline(report), 100)}</p>
<label class="coverage-label" for="coverage">Hooligans that ran: ${count(score.ran)} of ${count(score.total)}</label>
<meter id="coverage" class="coverage" min="0" max="${count(score.total)}" value="${count(score.ran)}">${count(score.ran)} of ${count(score.total)}</meter>
</div>
</section>`;
}

function affectedList(affected: readonly string[]): string {
  if (affected.length === 0) return '';

  const shown = affected
    .slice(0, 5)
    .map((item) => `<li><code>${esc(item, 300)}</code></li>`)
    .join('');
  const more = affected.length > 5 ? `<li>and ${affected.length - 5} more</li>` : '';

  return `<p class="label">Seen on</p>
<ul class="affected">${shown}${more}</ul>`;
}

function findingBody(finding: Finding, promptId: string): string {
  return `${affectedList(finding.affected)}
<p class="label">What Hooligans saw</p>
<pre>${esc(finding.evidence)}</pre>
<p class="label">What to do</p>
<p>${esc(finding.fix, 1000)}</p>
<details class="prompt">
<summary>Prompt for your AI tool</summary>
<pre id="${promptId}">${esc(finding.fixPrompt, 8000)}</pre>
<button type="button" class="copy" data-target="${promptId}">Copy prompt</button>
</details>`;
}

function topCard(finding: ScoredFinding, index: number): string {
  const id = `top-${index + 1}`;

  return `<article class="finding" aria-labelledby="${id}-title">
<div class="finding-head">${chip(finding.severity)}<h3 id="${id}-title">${index + 1}. ${esc(finding.title, 200)}</h3></div>
<p class="meta">${esc(hooliganName(finding.hooligan), 80)} &middot; ${pointsText(finding.pointsLost)}</p>
${findingBody(finding, `prompt-${id}`)}
</article>`;
}

function topSection(top: readonly ScoredFinding[]): string {
  if (top.length === 0) {
    return `<section aria-labelledby="top-title">
<h2 id="top-title">Fix these first</h2>
<p>Nothing to fix from what ran. That is not a promise the app is safe: see what was not looked at below.</p>
</section>`;
  }

  const master = `<details class="prompt finding">
<summary>Copy all of these as one prompt</summary>
<pre id="prompt-all">${esc(buildMasterPrompt(top), 40000)}</pre>
<button type="button" class="copy" data-target="prompt-all">Copy prompt</button>
</details>`;

  return `<section aria-labelledby="top-title">
<h2 id="top-title">Fix these first</h2>
${top.map(topCard).join('\n')}
${master}
</section>`;
}

function moreSection(rest: readonly ScoredFinding[]): string {
  if (rest.length === 0) return '';

  const items = rest
    .map((finding, index) => {
      const id = `more-${index + 1}`;
      return `<details class="finding more">
<summary>${chip(finding.severity)} <span>${esc(finding.title, 200)}</span> <span class="meta">${esc(hooliganName(finding.hooligan), 80)} &middot; ${pointsText(finding.pointsLost)}</span></summary>
${findingBody(finding, `prompt-${id}`)}
</details>`;
    })
    .join('\n');

  return `<section aria-labelledby="more-title">
<h2 id="more-title">Everything else</h2>
${items}
</section>`;
}

function lookSection(items: readonly Finding[]): string {
  if (items.length === 0) return '';

  const list = items
    .map((finding, index) => {
      const id = `look-${index + 1}`;
      return `<details class="finding more">
<summary><span class="chip chip-low">Worth a look</span> <span>${esc(finding.title, 200)}</span> <span class="meta">${esc(hooliganName(finding.hooligan), 80)}</span></summary>
${findingBody(finding, `prompt-${id}`)}
</details>`;
    })
    .join('\n');

  return `<section aria-labelledby="look-title">
<h2 id="look-title">Worth a look</h2>
<p>Hooligans is not sure about these, so they cost no points.</p>
${list}
</section>`;
}

function barClass(level: LoadLevel): string {
  if (Number(level.errors) > 0) return 'bar-errors';
  return Number(level.p95Ms) >= 1000 ? 'bar-slow' : 'bar-ok';
}

/** One bar for each number of users, as long as the slowest typical answer at that step. */
function loadChart(levels: readonly LoadLevel[]): string {
  const rows = levels.slice(0, CHART_ROWS);
  const slowest = Math.max(1, ...rows.map((level) => Number(count(level.p95Ms))));

  const bars = rows.map((level, index) => {
    const top = index * CHART_ROW + 4;
    const width = Math.max(4, Math.round((Number(count(level.p95Ms)) / slowest) * CHART_BAR_MAX));

    return `<text class="chart-label" x="0" y="${top + 17}">${count(level.users)} users</text>
<rect class="bar ${barClass(level)}" x="${CHART_LABEL}" y="${top}" width="${width}" height="22" rx="4"/>
<text class="chart-value" x="${CHART_LABEL + width + 8}" y="${top + 17}">${count(level.p95Ms)} ms</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${rows.length * CHART_ROW + 8}" role="img" aria-label="The slowest typical answer at each number of users">
${bars.join('\n')}
</svg>`;
}

function loadTable(levels: readonly LoadLevel[]): string {
  const rows = levels
    .slice(0, CHART_ROWS)
    .map(
      (level) =>
        `<tr><td>${count(level.users)}</td><td>${count(level.requests)}</td><td>${count(level.errors)}</td><td>${count(level.p50Ms)} ms</td><td>${count(level.p95Ms)} ms</td></tr>`,
    )
    .join('');

  return `<table class="load-table">
<thead><tr><th>Users</th><th>Requests</th><th>Errors</th><th>Typical answer</th><th>Slowest typical answer</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

function loadSection(load: Report['load']): string {
  if (!load || !Array.isArray(load.levels) || load.levels.length === 0) return '';

  return `<section aria-labelledby="load-title">
<h2 id="load-title">How it held up under load</h2>
<p>${esc(describeLoad(load), 800)}</p>
${loadChart(load.levels)}
${loadTable(load.levels)}
<p class="meta">The crowd and the app share one machine, so these numbers are relative. They show what gives way first.</p>
</section>`;
}

function activitySection(report: Report): string {
  const { activity, run, skipped } = report;
  const stages = run.stagesRun.map(stageLabel).join(', ') || 'none';

  const cleanup = activity.cleanupMarker
    ? `<p>Everything Hooligans typed into your app contains <code>${esc(activity.cleanupMarker, 100)}</code>. Search for it to find and delete the junk data.</p>`
    : '<p>Hooligans did not write anything through your app.</p>';

  const skippedList =
    skipped.length > 0
      ? `<p class="label">Skipped</p>
<ul>${skipped.map((item) => `<li><strong>${esc(hooliganName(item.id), 80)}</strong>: ${esc(item.reason, 300)}</li>`).join('')}</ul>`
      : '';

  return `<section aria-labelledby="did-title">
<h2 id="did-title">What Hooligans did</h2>
<dl class="facts">
<div><dt>Stages run</dt><dd>${esc(stages, 200)}</dd></div>
<div><dt>Requests sent</dt><dd>${count(activity.requestsSent)}</dd></div>
<div><dt>Blocked by the gate</dt><dd>${count(activity.requestsBlocked)}</dd></div>
<div><dt>Writes through your app</dt><dd>${count(activity.writes)}</dd></div>
</dl>
${cleanup}
${skippedList}
</section>`;
}

function notLookedAtSection(items: readonly string[]): string {
  const body =
    items.length > 0
      ? `<ul>${items.map((item) => `<li>${esc(item, 400)}</li>`).join('')}</ul>`
      : '<p>No gaps were recorded for this run.</p>';

  return `<section aria-labelledby="gaps-title">
<h2 id="gaps-title">What it did not look at</h2>
${body}
</section>`;
}

function pageFooter(): string {
  return `<footer class="page-footer">
<p>Hooligans never says an app is safe, because no scan can. This report lists what its checks found and what they did not look at.</p>
<p>Made on your machine. This page makes no network requests.</p>
</footer>`;
}

/** One self-contained page: no external requests, no inline styles, and a locked-down policy. */
export function renderHtml(report: Report): string {
  const styles = readAsset('styles.css');
  const template = readAsset('template.html');

  const body = [
    pageHeader(report),
    '<main>',
    scoreCard(report),
    topSection(report.findings.slice(0, TOP_COUNT)),
    moreSection(report.findings.slice(TOP_COUNT)),
    lookSection(report.worthALook),
    loadSection(report.load),
    activitySection(report),
    notLookedAtSection(report.notLookedAt),
    '</main>',
    pageFooter(),
  ].join('\n');

  const csp = [
    "default-src 'none'",
    `style-src 'sha256-${sha256(styles)}'`,
    `script-src 'sha256-${sha256(COPY_SCRIPT)}'`,
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const values: Record<string, string> = {
    csp,
    title: esc(`Hooligans report: ${report.run.target}`, 200),
    styles,
    body,
    script: COPY_SCRIPT,
  };

  return template.replace(
    /\{\{(csp|title|styles|body|script)\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
}
