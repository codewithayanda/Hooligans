// Copies the files that tsc does not: the report template and its styles.
// Run after tsc: node scripts/copy-assets.mjs

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = ['src/report/template.html', 'src/report/styles.css'];

for (const asset of ASSETS) {
  const from = join(root, asset);
  if (!existsSync(from)) continue;

  const to = join(root, 'dist', asset.slice('src/'.length));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
