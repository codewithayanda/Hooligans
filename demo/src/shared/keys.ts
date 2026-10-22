function part(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A made-up Supabase anon key, built when the server runs so no key-shaped text sits in the source. */
export function fakeAnonKey(): string {
  const header = part({ alg: 'HS256', typ: 'JWT' });
  const claims = part({ iss: 'supabase-demo', role: 'anon', ref: 'demo' });

  return `${header}.${claims}.${'s'.repeat(32)}`;
}
