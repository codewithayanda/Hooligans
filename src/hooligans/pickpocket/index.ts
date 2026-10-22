import type { AppMap } from '../../core/app-map.js';
import type { HooliganContext } from '../../core/context.js';
import type { Finding } from '../../core/finding.js';
import type { Hooligan, HooliganResult } from '../../core/hooligan.js';
import { maskSecret } from '../../util/redact.js';
import { MAX_SCRIPTS, parse, pathOf, readAppFiles } from '../_shared/files.js';
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

const MAX_MAPS = 20;
const MAX_SECRETS = 20;

const FILE_BYTES = 64 * 1024;
const MAP_BYTES = 256 * 1024;

const ENV_FILES = ['/.env', '/.env.local', '/.env.production', '/.env.development'];
const GIT_FILES = ['/.git/config', '/.git/HEAD'];

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

/** The app's scripts and pages, read the way any visitor could read them. */
async function checkSecrets(context: HooliganContext, gaps: string[]): Promise<Finding[]> {
  const { files, unread, cutShort } = await readAppFiles(context);
  const seen = new Map<string, { hit: SecretHit; paths: string[] }>();

  for (const file of files) {
    for (const hit of findSecrets(file.body)) {
      const key = `${hit.kind.id}:${maskSecret(hit.value)}`;
      const entry: { hit: SecretHit; paths: string[] } = seen.get(key) ?? { hit, paths: [] };
      if (!entry.paths.includes(file.path)) entry.paths.push(file.path);
      seen.set(key, entry);
    }
  }

  if (unread > 0) gaps.push(`Pickpocket read ${MAX_SCRIPTS} scripts and left ${unread} unread.`);
  if (cutShort) gaps.push('Pickpocket read only the first part of some very large files.');

  return [...seen.values()]
    .slice(0, MAX_SECRETS)
    .map((entry) => secretFinding(context.map, entry.hit, entry.paths));
}

async function run(context: HooliganContext): Promise<HooliganResult> {
  const origin = new URL(context.map.entry).origin;
  const gaps = [
    'Pickpocket only reads the files your pages load and a short list of well-known paths such as .env and .git. It does not guess other file names.',
  ];

  const findings = [
    ...(await checkStrayFiles(context, origin)),
    ...(await checkSourceMaps(context, origin)),
    ...(await checkSecrets(context, gaps)),
  ];

  return { findings, notLookedAt: gaps };
}

export const pickpocket: Hooligan = { ...identity('pickpocket'), sessions: 0, run };
