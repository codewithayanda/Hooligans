import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../../../../src/core/context.js';
import { cameBackAsMarkup } from '../../../../src/hooligans/vandal/reflected.js';

const PROBE = '<hg-hooligans-test-run>';

function reply(body: string, contentType = 'text/html; charset=utf-8'): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': contentType },
    body,
    durationMs: 1,
    truncated: false,
    url: 'http://localhost:3000/search',
  };
}

describe('cameBackAsMarkup', () => {
  it('is true when a page shows the probe exactly as it was typed', () => {
    expect(cameBackAsMarkup(reply(`<h1>Results for ${PROBE}</h1>`), PROBE)).toBe(true);
  });

  it('is false when the page escaped it', () => {
    const escaped = '<h1>Results for &lt;hg-hooligans-test-run&gt;</h1>';

    expect(cameBackAsMarkup(reply(escaped), PROBE)).toBe(false);
  });

  it('is false when the answer is data and not a page', () => {
    const data = JSON.stringify({ q: PROBE });

    expect(cameBackAsMarkup(reply(data, 'application/json'), PROBE)).toBe(false);
    expect(cameBackAsMarkup(reply(PROBE, 'text/plain'), PROBE)).toBe(false);
  });

  it('is false when the probe is not in the page at all', () => {
    expect(cameBackAsMarkup(reply('<h1>Nothing found</h1>'), PROBE)).toBe(false);
  });
});
