import { describe, expect, it } from 'vitest';
import {
  cleanText,
  escapeHtml,
  stripAnsi,
  stripControlCharacters,
  truncate,
} from '../../../src/util/text.js';

const esc = String.fromCharCode(27);
const bell = String.fromCharCode(7);

describe('stripAnsi', () => {
  it('removes colour and cursor sequences', () => {
    expect(stripAnsi(`${esc}[31mred${esc}[0m and ${esc}[2Jclear`)).toBe('red and clear');
  });
});

describe('stripControlCharacters', () => {
  it('removes control characters but keeps line breaks and tabs', () => {
    expect(stripControlCharacters(`a${bell}b\n\tc`)).toBe('ab\n\tc');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('abc', 5)).toBe('abc');
  });

  it('shortens long text and says so', () => {
    expect(truncate('abcdef', 5)).toBe('ab...');
  });
});

describe('cleanText', () => {
  it('removes escape sequences and control characters, then shortens', () => {
    expect(cleanText(`${esc}[31m${bell}abcdef`, 5)).toBe('ab...');
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that can change a page', () => {
    expect(escapeHtml('<script>alert("x")</script> & \'y\'')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });
});
