/** The claims of a JSON web token, read without checking the signature. Null when it is not one. */
function jwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const isObject = typeof claims === 'object' && claims !== null && !Array.isArray(claims);
    return isObject ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function jwtRole(token: string): string | null {
  const role = jwtClaims(token)?.role;
  return typeof role === 'string' ? role : null;
}
