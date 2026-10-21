#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { CommanderError } from 'commander';
import { buildProgram } from './program.js';

const manifest = new URL('../../package.json', import.meta.url);
const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string };

try {
  await buildProgram(version).parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 3;
  }
}
