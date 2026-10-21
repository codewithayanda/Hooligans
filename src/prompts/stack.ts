import type { AppMap } from '../core/app-map.js';

const FRAMEWORKS: Readonly<Record<string, string>> = {
  nextjs: 'Next.js',
  vite: 'Vite',
  express: 'Express',
};

const BACKENDS: Readonly<Record<string, string>> = {
  supabase: 'Supabase',
  firebase: 'Firebase',
};

function joinNames(names: readonly string[]): string {
  const last = names[names.length - 1] ?? '';
  return names.length <= 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}

/** Plain wording for a prompt. Only names the Scout recognises are used, never page text. */
export function describeStack(stack: AppMap['stack']): string {
  const framework = stack.framework ? FRAMEWORKS[stack.framework] : undefined;
  const backends = stack.backends.flatMap((id) => {
    const name = BACKENDS[id];
    return name ? [name] : [];
  });

  if (!framework && backends.length === 0) {
    return 'I could not tell which framework this app uses, so look at how it is set up before you change anything.';
  }

  const app = framework ? `This is a ${framework} app` : 'This is a web app';
  return backends.length > 0 ? `${app} that uses ${joinNames(backends)}.` : `${app}.`;
}
