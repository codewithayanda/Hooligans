import type { AppMap } from '../../core/app-map.js';
import type { Finding } from '../../core/finding.js';
import { maskSecret } from '../../util/redact.js';
import { examples, finish, joinWords, safeToken } from '../_shared/finding.js';
import type { SecretHit } from './patterns.js';

const HOOLIGAN = 'pickpocket';

const KEEP_ON_THE_SERVER =
  'Remove it from every file that is sent to the browser, keep it in a server-side environment variable, and call the service from your server. Then create a new one and revoke this one, because it has been public.';

export type FoundMap = { path: string; hasCode: boolean | null };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One secret, with every public file it was seen in. */
export function secretFinding(map: AppMap, hit: SecretHit, paths: string[]): Finding {
  const { kind, value } = hit;
  const masked = maskSecret(value);
  const what = capitalize(kind.label);

  return finish(
    {
      id: `pickpocket.secret.${kind.id}`,
      hooligan: HOOLIGAN,
      title: `${what} is in a file anyone can download`,
      severity: kind.severity,
      category: 'security',
      confidence: kind.confidence,
      rootCause: `pickpocket:secret:${kind.id}:${masked}`,
      affected: paths,
      evidence: `Found in ${paths.join(', ')}: ${masked}. Hooligans did not use it or test it.`,
      fix: kind.fix,
      problem: `${what} is sitting in a file that anyone can download${examples(paths)}. The value starts like ${masked}.`,
      change: KEEP_ON_THE_SERVER,
      keep: 'The feature that uses it must keep working through your server.',
    },
    map,
  );
}

export function exposedEnvFinding(
  map: AppMap,
  paths: string[],
  names: string[],
  kinds: string[],
): Finding {
  const sample = joinWords(names.slice(0, 5).map((name) => safeToken(name, 40)));
  const secrets = kinds.length > 0 ? ` It includes what looks like ${joinWords(kinds)}.` : '';

  return finish(
    {
      id: 'pickpocket.exposed-env',
      hooligan: HOOLIGAN,
      title: 'Your .env file can be downloaded by anyone',
      severity: 'critical',
      category: 'security',
      confidence: 'high',
      rootCause: 'pickpocket:exposed:env',
      affected: paths,
      evidence: `${paths.join(', ')} answered with what looks like a settings file: ${names.length} settings, such as ${sample}. The values are not shown here.${secrets}`,
      fix: 'Stop serving the file, and treat every value in it as leaked: change the passwords and keys it holds.',
      problem: `The file ${safeToken(paths[0] ?? '/.env')} can be downloaded without a login and looks like an environment file.`,
      change:
        'Stop serving the file: keep .env files outside the public folder and out of the build output. Then change every key and password it contained, because it has been public.',
      keep: 'The app must still read its settings on the server.',
    },
    map,
  );
}

export function exposedGitFinding(map: AppMap, paths: string[]): Finding {
  return finish(
    {
      id: 'pickpocket.exposed-git',
      hooligan: HOOLIGAN,
      title: 'Your .git folder can be downloaded, so anyone can rebuild your code',
      severity: 'high',
      category: 'security',
      confidence: 'high',
      rootCause: 'pickpocket:exposed:git',
      affected: paths,
      evidence: `${paths.join(', ')} can be downloaded without a login. A public .git folder lets anyone rebuild your code and its whole history, including old secrets.`,
      fix: 'Stop publishing the .git folder, and assume any secret that was ever committed is known: change it.',
      problem: `The ${safeToken(paths[0] ?? '/.git/config')} file can be downloaded without a login, so the .git folder is public.`,
      change:
        'Make sure the .git folder is not inside the folder your server publishes, and block requests for paths that start with /.git. Then change any secret that was ever committed.',
      keep: 'The site must still deploy and serve normally.',
    },
    map,
  );
}

/** All the public source maps are one problem with one fix, so they are one finding. */
export function sourceMapFinding(map: AppMap, found: FoundMap[]): Finding {
  const paths = found.map((entry) => entry.path);
  const readable = found.some((entry) => entry.hasCode !== false);
  const what = readable ? 'your original source files' : 'the names of your original source files';
  const detail = `${paths.length === 1 ? 'It contains' : 'They contain'} ${what}.`;

  return finish(
    {
      id: 'pickpocket.public-source-map',
      hooligan: HOOLIGAN,
      title: readable
        ? 'Your source maps are public, so anyone can read your original code'
        : 'Your source maps are public, so anyone can see how your code is organised',
      severity: readable ? 'medium' : 'low',
      category: 'security',
      confidence: 'high',
      rootCause: 'pickpocket:source-map',
      affected: paths,
      evidence: `${paths.length === 1 ? 'The file' : 'The files'} ${paths.join(', ')} can be downloaded without a login. ${detail}`,
      fix: 'Stop publishing source maps in production, or serve them only to your own error tracker.',
      problem: `The source map${paths.length === 1 ? '' : 's'}${examples(paths)} can be downloaded without a login.`,
      change:
        'Turn off production source maps in the build config, or upload them to your error tracker and do not serve them publicly.',
      keep: 'Local development and error reporting must keep working.',
    },
    map,
  );
}
