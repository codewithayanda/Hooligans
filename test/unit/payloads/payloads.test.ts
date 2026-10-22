import { describe, expect, it } from 'vitest';
import { CLUMSY, clumsyFor } from '../../../src/payloads/clumsy.js';
import { SQL_PROBES } from '../../../src/payloads/sql-probes.js';
import { XSS_PROBES } from '../../../src/payloads/xss.js';

const MARKER = 'hooligans-20261022-101112-ab12';

/** Anything that could run, read, change or delete something, or reach out to another place. */
const DESTRUCTIVE: readonly RegExp[] = [
  /\b(?:drop|delete|truncate|update|insert|alter|create|union|select|exec|execute|shutdown|grant)\b/i,
  /<\s*script/i,
  /\bon\w+\s*=/i,
  /javascript:/i,
  /data:text\/html/i,
  /\.\.[\\/]/,
  /\/etc\/|c:\\/i,
  /file:\/\//i,
  /https?:\/\//i,
  /\$\{|`|\|\||&&|;/,
];

function everything(): { source: string; value: string }[] {
  return [
    ...CLUMSY.map((input) => ({ source: `clumsy ${input.id}`, value: input.value() })),
    ...XSS_PROBES.map((probe) => ({ source: `xss ${probe.id}`, value: probe.value(MARKER) })),
    ...SQL_PROBES.map((probe) => ({ source: `sql ${probe.id}`, value: probe.value() })),
  ];
}

describe('the payload lists', () => {
  it('say what each entry proves, in words', () => {
    const entries = [...CLUMSY, ...XSS_PROBES, ...SQL_PROBES];

    for (const entry of entries) expect(entry.proves.length).toBeGreaterThan(15);
  });

  it('have an id for each entry, and no id twice in a list', () => {
    for (const list of [CLUMSY, XSS_PROBES, SQL_PROBES]) {
      const ids = list.map((entry) => entry.id);

      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('contain nothing that could delete, change or run anything, or reach another place', () => {
    for (const { source, value } of everything()) {
      for (const pattern of DESTRUCTIVE) {
        expect(pattern.test(value), `${source} matches ${String(pattern)}`).toBe(false);
      }
    }
  });
});

describe('the markup probes', () => {
  it('only ever name an element that does not exist, built around the marker', () => {
    for (const probe of XSS_PROBES) {
      expect(probe.value(MARKER)).toMatch(/^(?:["']>)?<hg-hooligans-[a-z0-9-]+>$/);
    }
  });

  it('cover text, a double quoted attribute and a single quoted attribute', () => {
    const values = XSS_PROBES.map((probe) => probe.value('m'));

    expect(values).toEqual(['<hg-m>', '"><hg-m>', "'><hg-m>"]);
  });
});

describe('the database probes', () => {
  it('are stray quotes and nothing else', () => {
    for (const probe of SQL_PROBES) expect(probe.value()).toMatch(/^["')]+$/);
  });
});

describe('the clumsy input', () => {
  it('fits the kind of field', () => {
    const text = clumsyFor('text').map((input) => input.id);
    const number = clumsyFor('number').map((input) => input.id);

    expect(text).toEqual(['empty', 'spaces', 'long', 'emoji', 'accents']);
    expect(number).toEqual(['empty', 'negative', 'zero', 'huge-number', 'not-a-number']);
  });

  it('is a long value of 2,000 characters and a number of 25 digits', () => {
    const value = (id: string): string => CLUMSY.find((input) => input.id === id)?.value() ?? '';

    expect(value('long')).toHaveLength(2000);
    expect(value('huge-number')).toBe('9'.repeat(25));
    expect(value('empty')).toBe('');
  });

  it('includes characters beyond plain letters', () => {
    const emoji = CLUMSY.find((input) => input.id === 'emoji')?.value() ?? '';

    expect(emoji.length).toBeGreaterThan(0);
    expect(/^[\x20-\x7e]*$/.test(emoji)).toBe(false);
  });
});
