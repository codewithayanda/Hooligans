import type { Submission } from '../../core/context.js';
import type { Body, FieldSpec } from './targets.js';
import type { Values } from './values.js';

export const IDENTIFIER_TOKEN = 'HOOLIGANSIDENTIFIER';
export const PASSWORD_TOKEN = 'HOOLIGANSPASSWORD';

export type Typed = { identifier: string; password: string };

/**
 * What a browser sent, with the made-up values it typed swapped for placeholders. Null when the
 * request does not carry both values in a shape Hooligans can repeat.
 */
export function deriveBody(submission: Submission, typed: Typed): Body | null {
  const type = submission.contentType.toLowerCase();

  if (type.includes('application/json')) {
    const { body } = submission;
    if (!body.includes(typed.identifier) || !body.includes(typed.password)) return null;

    const text = body
      .replaceAll(typed.identifier, IDENTIFIER_TOKEN)
      .replaceAll(typed.password, PASSWORD_TOKEN);

    try {
      JSON.parse(text);
    } catch {
      return null;
    }
    return { kind: 'json', text };
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    const fields = [...new URLSearchParams(submission.body)].map(([name, value]): FieldSpec => {
      if (value === typed.identifier) return { name, fill: 'email' };
      if (value === typed.password) return { name, fill: 'password' };
      return { name, fill: 'fixed', value };
    });

    const hasBoth =
      fields.some((field) => field.fill === 'email') &&
      fields.some((field) => field.fill === 'password');
    return hasBoth ? { kind: 'form', fields } : null;
  }

  return null;
}

function valueOf(field: FieldSpec, values: Values): string {
  switch (field.fill) {
    case 'email':
      return values.email;
    case 'username':
      return values.username;
    case 'password':
      return values.password;
    case 'fixed':
      return field.value ?? '';
    default:
      return values.text;
  }
}

/** The body of one attempt, with the content type that goes with it. */
export function renderBody(body: Body, values: Values): { contentType: string; text: string } {
  if (body.kind === 'json') {
    return {
      contentType: 'application/json',
      text: body.text
        .replaceAll(IDENTIFIER_TOKEN, values.email)
        .replaceAll(PASSWORD_TOKEN, values.password),
    };
  }

  const entries = body.fields.map((field): [string, string] => [
    field.name,
    valueOf(field, values),
  ]);
  return {
    contentType: 'application/x-www-form-urlencoded',
    text: new URLSearchParams(entries).toString(),
  };
}
