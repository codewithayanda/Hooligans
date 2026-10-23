import { describe, expect, it } from 'vitest';
import type { Attempt } from '../../../../src/hooligans/_shared/fuzz.js';
import { findTrace, react } from '../../../../src/hooligans/fat-fingers/reaction.js';

const NODE = [
  "TypeError: Cannot read properties of undefined (reading 'trim')",
  '    at saveMessage (/srv/shop/src/contact.js:42:17)',
  '    at handleContact (/srv/shop/src/routes.js:18:5)',
].join('\n');

const PYTHON = [
  'Traceback (most recent call last):',
  '  File "/app/main.py", line 12, in handler',
  '    int(value)',
  "ValueError: invalid literal for int() with base 10: 'abc'",
].join('\n');

const DOTNET = [
  'System.NullReferenceException: Object reference not set to an instance of an object.',
  '   at Shop.Controllers.ContactController.Post(String name) in C:\\src\\Shop\\Contact.cs:line 31',
].join('\n');

const JAVA = [
  'java.lang.NumberFormatException: For input string: "abc"',
  '\tat com.shop.ContactController.post(ContactController.java:31)',
].join('\n');

const EXPRESS_PAGE =
  '<pre>TypeError: Cannot read properties of undefined<br> &nbsp; &nbsp;at save (/srv/app/save.js:3:9)<br> &nbsp; &nbsp;at run (/srv/app/run.js:8:2)</pre>';

const FAILED: Attempt = { kind: 'failed' };

function answer(status: number, body = ''): Attempt {
  return {
    kind: 'answer',
    response: {
      status,
      headers: {},
      body,
      durationMs: 1,
      truncated: false,
      url: 'http://localhost:3000/api/contact',
    },
  };
}

describe('findTrace', () => {
  it.each([
    ['Node', NODE],
    ['Python', PYTHON],
    ['.NET', DOTNET],
    ['Java', JAVA],
    ['Java thread', 'Exception in thread "main" java.lang.IllegalStateException: boom'],
    ['PHP', 'Fatal error: Uncaught TypeError: Bad operand types in /var/www/html/contact.php:12'],
    [
      'PHP page',
      '<b>Warning</b>:  Division by zero in <b>/var/www/html/a.php</b> on line <b>9</b>',
    ],
    ['Ruby', "/app/controllers/contact_controller.rb:12:in `create'"],
    ['Express error page', EXPRESS_PAGE],
  ])('recognises a %s stack trace', (_language, body) => {
    expect(findTrace(body)).not.toBeNull();
  });

  it.each([
    ['a short message', 'Name is required'],
    ['a JSON error', '{"error":"The name is too long"}'],
    ['a web page', '<html><body><h1>Results</h1><p>We ship at dawn (usually).</p></body></html>'],
    ['nothing', ''],
  ])('finds no trace in %s', (_what, body) => {
    expect(findTrace(body)).toBeNull();
  });

  it('keeps the start of the message and notes that file paths show', () => {
    expect(findTrace(NODE)).toEqual({
      excerpt: "TypeError: Cannot read properties of undefined (reading 'trim')",
      hasPaths: true,
    });
  });

  it('reads an error page whose lines are set on break tags', () => {
    expect(findTrace(EXPRESS_PAGE)).toEqual({
      excerpt: 'TypeError: Cannot read properties of undefined',
      hasPaths: true,
    });
  });

  it('says when no file is named', () => {
    const body = 'Exception in thread "main" java.lang.IllegalStateException: boom';

    expect(findTrace(body)).toEqual({ excerpt: body, hasPaths: false });
  });

  it('only reads the start of a very long answer', () => {
    const late = `${'x'.repeat(40_000)}\n${NODE}`;
    const early = `${NODE}\n${'x'.repeat(100_000)}`;

    expect(findTrace(late)).toBeNull();
    expect(findTrace(early)).not.toBeNull();
  });

  it('cuts a long first line at 110 characters', () => {
    const body = `Error: ${'x'.repeat(300)}\n    at f (/a/b.js:1:1)`;

    expect(findTrace(body)?.excerpt).toHaveLength(110);
  });
});

describe('react', () => {
  it.each<[string, Attempt]>([
    ['an ordinary answer', answer(200, 'Thanks')],
    ['no content', answer(204)],
    ['a refusal', answer(400, '{"error":"The name is too long"}')],
    ['a missing page', answer(404, 'Not found')],
    ['a failure it cannot explain', FAILED],
  ])('takes %s as fine', (_what, result) => {
    expect(react(result)).toEqual({ kind: 'fine' });
  });

  it('reports a server error, with the trace when there is one', () => {
    expect(react(answer(500, 'Internal Server Error'))).toEqual({
      kind: 'error',
      status: 500,
      trace: null,
    });
    expect(react(answer(502, NODE))).toMatchObject({
      kind: 'error',
      status: 502,
      trace: { hasPaths: true },
    });
  });

  it('reports a stack trace in an answer that does not say it failed', () => {
    expect(react(answer(200, NODE))).toMatchObject({ kind: 'leak', trace: { hasPaths: true } });
    expect(react(answer(400, NODE))).toMatchObject({ kind: 'leak' });
  });

  it('reports a request that got no answer in time, and an app that did not answer at all', () => {
    expect(react({ kind: 'hang' })).toEqual({ kind: 'hang' });
    expect(react({ kind: 'down' })).toEqual({ kind: 'down' });
  });
});
