import type { AppMap } from '../../core/app-map.js';
import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { maskSecret } from '../../util/redact.js';
import { identity } from '../_shared/identity.js';
import { isHtml, probe } from '../_shared/probe.js';
import {
  exposedEnvFinding,
  exposedGitFinding,
  secretFinding,
  sourceMapFinding,
  type FoundMap,
} from './findings.js';
import {
  describeSourceMap,
  envNames,
  findSecrets,
  looksLikeGitConfig,
  looksLikeGitHead,
  type SecretHit,
} from './patterns.js';

const MAX_SCRIPTS = 25;
const MAX_PAGES = 10;
const MAX_MAPS = 20;
const MAX_SECRETS = 20;

const FILE_BYTES = 64 * 1024;
const MAP_BYTES = 256 * 1024;
const PAGE_BYTES = 1024 * 1024;
const SCRIPT_BYTES = 3 * 1024 * 1024;

const ENV_FILES = ['/.env', '/.env.local', '/.env.production', '/.env.development'];
const GIT_FILES = ['/.git/config', '/.git/HEAD'];

type Target = { url: string; path: string; limit: number };

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function sameOrigin(urls: readonly string[], origin: string): string[] {
  return [...new Set(urls)].filter((url) => parse(url)?.origin === origin);
}

function pathOf(url: string): string {
  return parse(url)?.pathname ?? url;
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The app's own files come before libraries, because a cap should never cut off the app. */
function appFirst(urls: readonly string[]): string[] {
  const library = (url: string): number => (url.includes('/node_modules/') ? 1 : 0);
  return [...urls].sort((a, b) => library(a) - library(b) || compareText(a, b));
}

/** .env files and the .git folder: a short list of well-known paths, each checked by its content. */
async function checkStrayFiles(context: HooliganContext, origin: string): Promise<Finding[]> {
  const { map, http } = context;
  const envPaths: string[] = [];
  const names = new Set<string>();
  const kinds = new Set<string>();

  for (const path of ENV_FILES) {
    const response = await probe(http, `${origin}${path}`, { maxBodyBytes: FILE_BYTES });
    if (!response || response.status !== 200 || isHtml(response)) continue;

    const found = envNames(response.body);
    if (found.length === 0) continue;

    envPaths.push(path);
    for (const name of found) names.add(name);
    for (const hit of findSecrets(response.body)) kinds.add(hit.kind.label);
  }

  const gitPaths: string[] = [];
  for (const path of GIT_FILES) {
    const response = await probe(http, `${origin}${path}`, { maxBodyBytes: FILE_BYTES });
    if (!response || response.status !== 200 || isHtml(response)) continue;

    const real = path.endsWith('config')
      ? looksLikeGitConfig(response.body)
      : looksLikeGitHead(response.body);
    if (real) gitPaths.push(path);
  }

  const findings: Finding[] = [];
  if (envPaths.length > 0) findings.push(exposedEnvFinding(map, envPaths, [...names], [...kinds]));
  if (gitPaths.length > 0) findings.push(exposedGitFinding(map, gitPaths));
  return findings;
}

function sourceMapUrls(map: AppMap, origin: string): string[] {
  const urls = new Set<string>();

  for (const asset of map.assets) {
    const url = parse(asset.url);
    if (!url || url.origin !== origin) continue;

    url.search = '';
    url.hash = '';
    if (asset.kind === 'sourcemap') urls.add(url.href);
    else if (asset.kind === 'script') urls.add(`${url.href}.map`);
  }

  return [...urls].slice(0, MAX_MAPS);
}

/** The maps the Scout saw mentioned, and the one next to every script. */
async function checkSourceMaps(context: HooliganContext, origin: string): Promise<Finding[]> {
  const found: FoundMap[] = [];

  for (const url of sourceMapUrls(context.map, origin)) {
    const response = await probe(context.http, url, { maxBodyBytes: MAP_BYTES });
    if (!response || response.status !== 200 || isHtml(response)) continue;

    const described = describeSourceMap(response.body);
    if (described) found.push({ path: pathOf(url), hasCode: described.hasCode });
  }

  return found.length > 0 ? [sourceMapFinding(context.map, found)] : [];
}

function secretTargets(map: AppMap, origin: string): { targets: Target[]; unread: number } {
  const scripts = appFirst(
    sameOrigin(
      map.assets.filter((asset) => asset.kind === 'script').map((asset) => asset.url),
      origin,
    ),
  );
  const pages = sameOrigin(
    map.pages.map((page) => page.url),
    origin,
  ).slice(0, MAX_PAGES);

  return {
    targets: [
      ...scripts
        .slice(0, MAX_SCRIPTS)
        .map((url) => ({ url, path: pathOf(url), limit: SCRIPT_BYTES })),
      ...pages.map((url) => ({ url, path: pathOf(url), limit: PAGE_BYTES })),
    ],
    unread: Math.max(0, scripts.length - MAX_SCRIPTS),
  };
}

/** The app's scripts and pages, read the way any visitor could read them. */
async function checkSecrets(
  context: HooliganContext,
  origin: string,
  gaps: string[],
): Promise<Finding[]> {
  const { map, http } = context;
  const { targets, unread } = secretTargets(map, origin);
  const seen = new Map<string, { hit: SecretHit; paths: string[] }>();
  let cutShort = false;

  for (const target of targets) {
    const response = await probe(http, target.url, { maxBodyBytes: target.limit });
    if (!response || response.status !== 200) continue;
    if (response.truncated) cutShort = true;

    for (const hit of findSecrets(response.body)) {
      const key = `${hit.kind.id}:${maskSecret(hit.value)}`;
      const entry: { hit: SecretHit; paths: string[] } = seen.get(key) ?? { hit, paths: [] };
      if (!entry.paths.includes(target.path)) entry.paths.push(target.path);
      seen.set(key, entry);
    }
  }

  if (unread > 0) gaps.push(`Pickpocket read ${MAX_SCRIPTS} scripts and left ${unread} unread.`);
  if (cutShort) gaps.push('Pickpocket read only the first part of some very large files.');

  return [...seen.values()]
    .slice(0, MAX_SECRETS)
    .map((entry) => secretFinding(map, entry.hit, entry.paths));
}

async function run(context: HooliganContext): Promise<HooliganResult> {
  const origin = new URL(context.map.entry).origin;
  const gaps = [
    'Pickpocket only reads the files your pages load and a short list of well-known paths such as .env and .git. It does not guess other file names.',
  ];

  const findings = [
    ...(await checkStrayFiles(context, origin)),
    ...(await checkSourceMaps(context, origin)),
    ...(await checkSecrets(context, origin, gaps)),
  ];

  return { findings, notLookedAt: gaps };
}

export const pickpocket: Hooligan = { ...identity('pickpocket'), sessions: 0, run };
