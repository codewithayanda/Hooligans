import { describe, expect, it } from 'vitest';
import { findSqlError } from '../../../../src/hooligans/vandal/sql-errors.js';

describe('findSqlError', () => {
  it.each([
    [
      'MySQL',
      "You have an error in your SQL syntax; check the manual for the right syntax to use near ''' at line 1",
      'You have an error in your SQL syntax',
    ],
    ['PostgreSQL', 'ERROR:  syntax error at or near "\'"', 'syntax error at or near'],
    ['SQLite', 'SQLITE_ERROR: unrecognized token: "\'"', 'SQLITE_ERROR'],
    [
      'SQL Server',
      "Unclosed quotation mark after the character string ''.",
      'Unclosed quotation mark after the character string',
    ],
    ['Oracle', 'ORA-01756: quoted string not properly terminated', 'ORA-01756'],
    ['SQL database', 'SQLSTATE[42000]: Syntax error or access violation', 'SQLSTATE[42000]'],
    ['SQL database', 'SequelizeDatabaseError: unterminated string', 'SequelizeDatabaseError'],
  ])('recognises a %s error', (engine, body, snippet) => {
    expect(findSqlError(body)).toEqual({ engine, snippet });
  });

  it('does not mind capital letters', () => {
    expect(findSqlError('YOU HAVE AN ERROR IN YOUR SQL SYNTAX')?.engine).toBe('MySQL');
  });

  it.each([
    ['an ordinary page', '<html><body><h1>Results for shoes</h1></body></html>'],
    ['a plain server error', 'Internal Server Error'],
    ['a message about syntax', 'Syntax highlighting is on'],
    ['nothing', ''],
  ])('finds no database error in %s', (_what, body) => {
    expect(findSqlError(body)).toBeNull();
  });
});
