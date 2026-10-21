// Fails when package-lock.json resolves a package from anywhere but the public npm registry.
// A private package feed would write its own address into the lockfile.
// Run: node scripts/check-lockfile.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = 'https://registry.npmjs.org/';

let lock;
try {
  lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
} catch (error) {
  console.error(`Lockfile check: cannot read package-lock.json (${error.message}).`);
  process.exit(1);
}

const entries = Object.entries(lock.packages ?? {});
const problems = [];

for (const [name, entry] of entries) {
  if (typeof entry.resolved === 'string' && !entry.resolved.startsWith(ALLOWED)) {
    const origin = entry.resolved.split('/').slice(0, 3).join('/');
    problems.push(`${name || '(root)'}  resolves from ${origin}`);
  }
}

if (problems.length > 0) {
  console.error(`Lockfile check: ${problems.length} package(s) do not resolve from ${ALLOWED}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`Lockfile check OK (${entries.length} entries).`);
