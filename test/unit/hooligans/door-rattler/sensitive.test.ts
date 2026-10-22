import { describe, expect, it } from 'vitest';
import {
  isSensitiveName,
  isSensitiveRoute,
  isSensitiveTable,
} from '../../../../src/hooligans/door-rattler/sensitive.js';

describe('isSensitiveName', () => {
  const names: [string, boolean][] = [
    ['orders', true],
    ['user_profiles', true],
    ['userId', true],
    ['camelCaseOrders', true],
    ['customers', true],
    ['/api/admin/stats', true],
    ['products', false],
    ['categories', false],
    ['posts', false],
    ['items', false],
    ['/api/products', false],
  ];

  it.each(names)('%s is private: %s', (name, expected) => {
    expect(isSensitiveName(name)).toBe(expected);
  });
});

describe('isSensitiveTable', () => {
  it('judges a table by its name and by its columns', () => {
    expect(isSensitiveTable('orders', [])).toBe(true);
    expect(isSensitiveTable('products', ['id', 'name'])).toBe(false);
    expect(isSensitiveTable('products', ['id', 'name', 'user_id'])).toBe(true);
    expect(isSensitiveTable('newsletter', ['id', 'email'])).toBe(true);
  });
});

describe('isSensitiveRoute', () => {
  it('judges a route by the words in its path', () => {
    expect(isSensitiveRoute('/api/users')).toBe(true);
    expect(isSensitiveRoute('/api/products')).toBe(false);
  });
});
