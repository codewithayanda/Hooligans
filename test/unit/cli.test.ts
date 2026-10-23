import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/cli/program.js';

describe('the command line program', () => {
  const program = buildProgram('0.0.0');
  const scan = program.commands.find((command) => command.name() === 'scan');

  it('registers the planned commands', () => {
    expect(program.commands.map((command) => command.name())).toEqual([
      'scan',
      'report',
      'login',
      'doctor',
      'list',
    ]);
  });

  it('takes a url, and asks for one when it is left out', () => {
    const url = scan?.options.find((option) => option.long === '--url');

    expect(url?.mandatory).toBe(false);
    expect(url?.required).toBe(true);
  });

  it('offers the flags from the design', () => {
    const flags = scan?.options.map((option) => option.long);
    expect(flags).toEqual(
      expect.arrayContaining([
        '--only',
        '--stages',
        '--yes',
        '--allow-host',
        '--include-risky',
        '--load',
        '--duration',
        '--json',
        '--fail-on',
        '--open',
      ]),
    );
  });
});
