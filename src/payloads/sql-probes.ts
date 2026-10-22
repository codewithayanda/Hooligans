export type SqlProbe = {
  id: string;
  /** What it finds out, in plain words. */
  proves: string;
  /** The text to type. */
  value: () => string;
};

/**
 * One stray quote each. A query that is built by joining text breaks on these and the app shows
 * the database's own error. They only break a query: they cannot read, change or delete anything.
 */
export const SQL_PROBES: readonly SqlProbe[] = [
  {
    id: 'apostrophe',
    proves: 'a stray apostrophe breaks the query and the app shows the database error',
    value: () => "'",
  },
  {
    id: 'double-quote',
    proves: 'a stray double quote breaks the query and the app shows the database error',
    value: () => '"',
  },
  {
    id: 'apostrophe-bracket',
    proves: 'an apostrophe and a bracket break the query and the app shows the database error',
    value: () => "')",
  },
];
