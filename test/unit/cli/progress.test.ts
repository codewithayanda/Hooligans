import { describe, expect, it } from 'vitest';
import { setColorEnabled } from '../../../src/cli/ui/color.js';
import { createProgress, silentProgress } from '../../../src/cli/ui/progress.js';

describe('progress', () => {
  it('writes one indented line for each step', () => {
    setColorEnabled(false);
    const lines: string[] = [];
    const progress = createProgress({ write: (text) => lines.push(text) });

    progress.step('Looking around');
    progress.step('Pickpocket: reading files');

    expect(lines).toEqual(['  Looking around\n', '  Pickpocket: reading files\n']);
  });

  it('can stay silent', () => {
    expect(() => silentProgress.step('anything')).not.toThrow();
  });
});
