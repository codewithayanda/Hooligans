import { describe, expect, it } from 'vitest';
import { redactUrl } from '../../../src/util/redact.js';

const fakeKey = ['sk', 'live', 'x'.repeat(24)].join('_');

describe('redactUrl', () => {
  it('hides the value of sensitive parameters and keeps the rest', () => {
    const result = redactUrl('http://localhost:3000/api?token=abc123&q=hello&API_KEY=zzz999');

    expect(result).not.toContain('abc123');
    expect(result).not.toContain('zzz999');
    expect(result).toContain('q=hello');
  });

  it('drops the username, password and fragment', () => {
    expect(redactUrl('http://user:pw@localhost:3000/a#section')).toBe('http://localhost:3000/a');
  });

  it('masks a secret that sits in the path', () => {
    expect(redactUrl(`http://localhost:3000/${fakeKey}/x`)).not.toContain(fakeKey);
  });

  it('copes with something that is not a URL', () => {
    expect(redactUrl(`not a url ${fakeKey}`)).not.toContain(fakeKey);
  });
});
