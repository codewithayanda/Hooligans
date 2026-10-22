/** Words that say a table or a route holds data about people or money. */
const SENSITIVE_WORDS = new Set([
  'user',
  'users',
  'account',
  'accounts',
  'profile',
  'profiles',
  'customer',
  'customers',
  'order',
  'orders',
  'payment',
  'payments',
  'invoice',
  'invoices',
  'subscription',
  'subscriptions',
  'message',
  'messages',
  'booking',
  'bookings',
  'member',
  'members',
  'employee',
  'employees',
  'patient',
  'patients',
  'admin',
  'private',
  'secret',
  'secrets',
  'token',
  'tokens',
  'session',
  'sessions',
  'credential',
  'credentials',
  'password',
  'passwords',
  'email',
  'emails',
  'phone',
  'address',
  'addresses',
  'card',
  'cards',
  'salary',
  'balance',
  'wallet',
  'transaction',
  'transactions',
  'logs',
  'audit',
  'internal',
  'debug',
]);

function words(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

export function isSensitiveName(name: string): boolean {
  return words(name).some((word) => SENSITIVE_WORDS.has(word));
}

/** A table is private when its name or any of its columns says so, such as orders or user_id. */
export function isSensitiveTable(table: string, columns: readonly string[]): boolean {
  return [table, ...columns].some(isSensitiveName);
}

export function isSensitiveRoute(path: string): boolean {
  return isSensitiveName(path);
}
