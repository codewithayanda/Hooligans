import { describe, expect, it } from 'vitest';
import type { Submission } from '../../../../src/core/context.js';
import {
  deriveBody,
  IDENTIFIER_TOKEN,
  PASSWORD_TOKEN,
  renderBody,
} from '../../../../src/hooligans/brute/template.js';
import type { Values } from '../../../../src/hooligans/brute/values.js';

const typed = { identifier: 'hooligans-run-0@hooligans.invalid', password: 'Pw1_abcDEF' };

const values: Values = {
  email: 'a@b.invalid',
  username: 'u1',
  password: 'p1',
  text: 'mark',
};

function submission(contentType: string, body: string): Submission {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/session',
    contentType,
    body,
    status: 401,
  };
}

describe('deriveBody', () => {
  it('keeps the shape of a JSON login and swaps the typed values for placeholders', () => {
    const body = JSON.stringify({
      email: typed.identifier,
      password: typed.password,
      remember: false,
    });

    expect(deriveBody(submission('application/json', body), typed)).toEqual({
      kind: 'json',
      text: `{"email":"${IDENTIFIER_TOKEN}","password":"${PASSWORD_TOKEN}","remember":false}`,
    });
  });

  it('finds the values inside a longer text, such as a GraphQL query', () => {
    const query = `mutation { login(email: "${typed.identifier}", password: "${typed.password}") }`;
    const derived = deriveBody(
      submission('application/json; charset=utf-8', JSON.stringify({ query })),
      typed,
    );

    expect(derived).toMatchObject({ kind: 'json' });
    expect(derived?.kind === 'json' ? derived.text : '').toContain(IDENTIFIER_TOKEN);
  });

  it('needs both values in a JSON body', () => {
    const body = JSON.stringify({ email: typed.identifier });

    expect(deriveBody(submission('application/json', body), typed)).toBeNull();
  });

  it('reads a form body, and keeps the fields it does not know as they were', () => {
    const body = new URLSearchParams({
      email: typed.identifier,
      password: typed.password,
      remember: 'on',
    }).toString();

    expect(deriveBody(submission('application/x-www-form-urlencoded', body), typed)).toEqual({
      kind: 'form',
      fields: [
        { name: 'email', fill: 'email' },
        { name: 'password', fill: 'password' },
        { name: 'remember', fill: 'fixed', value: 'on' },
      ],
    });
  });

  it('needs both values in a form body', () => {
    const body = new URLSearchParams({ email: typed.identifier }).toString();

    expect(deriveBody(submission('application/x-www-form-urlencoded', body), typed)).toBeNull();
  });

  it('does not repeat a body it cannot read', () => {
    expect(deriveBody(submission('multipart/form-data; boundary=x', 'x'), typed)).toBeNull();
    expect(deriveBody(submission('', ''), typed)).toBeNull();
  });
});

describe('renderBody', () => {
  it('builds a form body from the values of one made-up person', () => {
    const rendered = renderBody(
      {
        kind: 'form',
        fields: [
          { name: 'email', fill: 'email' },
          { name: 'pass', fill: 'password' },
          { name: 'user', fill: 'username' },
          { name: 'note', fill: 'text' },
          { name: 'remember', fill: 'fixed', value: 'on' },
        ],
      },
      values,
    );

    expect(rendered).toEqual({
      contentType: 'application/x-www-form-urlencoded',
      text: 'email=a%40b.invalid&pass=p1&user=u1&note=mark&remember=on',
    });
  });

  it('puts the values of one made-up person into a JSON body, wherever the placeholders are', () => {
    const rendered = renderBody(
      {
        kind: 'json',
        text: `{"a":"${IDENTIFIER_TOKEN}","b":"${PASSWORD_TOKEN}","c":"${IDENTIFIER_TOKEN}"}`,
      },
      values,
    );

    expect(rendered).toEqual({
      contentType: 'application/json',
      text: '{"a":"a@b.invalid","b":"p1","c":"a@b.invalid"}',
    });
  });
});
