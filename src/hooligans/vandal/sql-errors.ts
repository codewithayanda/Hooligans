export type SqlError = { engine: string; snippet: string };

const SIGNS: readonly { engine: string; pattern: RegExp }[] = [
  {
    engine: 'MySQL',
    pattern: /You have an error in your SQL syntax|mysqli?_sql_exception|Warning: mysqli?_/i,
  },
  {
    engine: 'PostgreSQL',
    pattern:
      /syntax error at or near|unterminated quoted string|PG::SyntaxError|pg_query\(\)|psycopg2\.errors/i,
  },
  { engine: 'SQLite', pattern: /SQLITE_ERROR|SQLite3::SQLException|unrecognized token: "/i },
  {
    engine: 'SQL Server',
    pattern:
      /Unclosed quotation mark after the character string|Incorrect syntax near|System\.Data\.SqlClient\.SqlException|Microsoft OLE DB Provider for SQL Server/i,
  },
  { engine: 'Oracle', pattern: /ORA-\d{5}|quoted string not properly terminated/ },
  {
    engine: 'SQL database',
    pattern:
      /SQLSTATE\[\w+\]|SequelizeDatabaseError|PrismaClientKnownRequestError|QueryFailedError|sqlalchemy\.exc\.|ActiveRecord::StatementInvalid|java\.sql\.SQLSyntaxErrorException|SqlException/,
  },
];

/** The database's own error message in an answer, with the engine it came from. Null when there is none. */
export function findSqlError(body: string): SqlError | null {
  for (const sign of SIGNS) {
    const match = sign.pattern.exec(body);
    if (match) return { engine: sign.engine, snippet: match[0].slice(0, 100) };
  }

  return null;
}
