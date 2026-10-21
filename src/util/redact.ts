export type SecretShape = { name: string; pattern: RegExp };

/** Shapes of well-known secrets. Pickpocket reads this list too. */
export const SECRET_SHAPES: readonly SecretShape[] = [
  { name: 'Stripe secret key', pattern: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Slack token', pattern: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'OpenAI style key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  {
    name: 'JSON web token',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: 'Private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'Database URL with a password',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"]+:[^\s@/'"]+@[^\s'"]+/,
  },
];

/** Keeps at most a quarter of the start and two characters of the end, so the type stays clear. */
export function maskSecret(value: string): string {
  const head = Math.min(7, Math.floor(value.length / 4));
  const tail = value.length >= 20 ? 2 : 0;

  if (head + tail < 3) return '[masked]';
  return `${value.slice(0, head)}...${tail > 0 ? value.slice(-tail) : ''}`;
}

export function containsSecret(text: string): boolean {
  return SECRET_SHAPES.some((shape) => shape.pattern.test(text));
}

const SENSITIVE_PARAMS =
  /^(?:access_token|api[-_]?key|apikey|auth|authorization|code|key|passwd|password|secret|session|sig|signature|token)$/i;

/** For logs: drops the username, password and fragment, and hides sensitive parameter values. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.hash = '';

    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAMS.test(name)) url.searchParams.set(name, '[redacted]');
    }

    return redactSecrets(url.toString());
  } catch {
    return redactSecrets(raw);
  }
}

/** Replaces every secret found in the text with its masked form. */
export function redactSecrets(text: string): string {
  return SECRET_SHAPES.reduce(
    (current, shape) =>
      current.replace(new RegExp(shape.pattern.source, 'g'), (match) => maskSecret(match)),
    text,
  );
}
