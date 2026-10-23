import { describe, expect, it } from 'vitest';
import { detectPushback, type Reply } from '../../../../src/hooligans/brute/pushback.js';

function reply(overrides: Partial<Reply> = {}): Reply {
  return {
    status: 401,
    ms: 20,
    location: '',
    retryAfter: false,
    text: 'wrong email or password',
    ...overrides,
  };
}

const wrong = (count: number): Reply[] => Array.from({ length: count }, () => reply());

describe('detectPushback', () => {
  it('sees nothing when every answer is the same', () => {
    expect(detectPushback(wrong(30))).toBeNull();
    expect(detectPushback([])).toBeNull();
  });

  it('sees a 429, and says at which attempt', () => {
    const found = detectPushback([...wrong(5), reply({ status: 429, text: '' })]);

    expect(found).toMatchObject({ at: 6 });
    expect(found?.why).toContain('429');
  });

  it('sees a lock', () => {
    expect(detectPushback([...wrong(2), reply({ status: 423 })])).toMatchObject({ at: 3 });
  });

  it('sees a Retry-After header on any answer', () => {
    expect(detectPushback([...wrong(2), reply({ retryAfter: true })])).toMatchObject({ at: 3 });
  });

  it('sees words that say the app limits attempts, even on the first answer', () => {
    const words = reply({ text: 'too many failed attempts. try again later.' });

    expect(detectPushback([...wrong(3), words])).toMatchObject({ at: 4 });
    expect(detectPushback([words])).toMatchObject({ at: 1 });
  });

  it('does not take an ordinary wrong password message for a limit', () => {
    const polite = reply({ text: 'invalid credentials. please try again.' });

    expect(detectPushback([polite, polite, polite])).toBeNull();
  });

  it('sees a captcha, in the words or in where it sent the caller', () => {
    expect(detectPushback([reply({ text: 'please solve the captcha' })])).toMatchObject({ at: 1 });
    expect(
      detectPushback([...wrong(2), reply({ status: 302, location: '/captcha' })]),
    ).toMatchObject({
      at: 3,
    });
  });

  it('sees an answer that changes to a refusal', () => {
    const found = detectPushback([...wrong(3), reply({ status: 403, text: 'forbidden' })]);

    expect(found).toMatchObject({ at: 4 });
    expect(found?.why).toContain('from 401 to 403');
  });

  it('does not mind an answer that changes to something harmless', () => {
    expect(detectPushback([...wrong(3), reply({ status: 200 })])).toBeNull();
  });

  it('sees answers that keep getting slower, after enough attempts', () => {
    const slow = [
      ...Array.from({ length: 6 }, () => reply({ ms: 100 })),
      ...Array.from({ length: 3 }, () => reply({ ms: 900 })),
    ];

    expect(detectPushback(slow)).toMatchObject({ at: 9 });
    expect(detectPushback(slow.slice(2, 9))).toBeNull();
  });

  it('does not mind a small difference in speed', () => {
    const steady = [
      ...Array.from({ length: 6 }, () => reply({ ms: 100 })),
      ...Array.from({ length: 3 }, () => reply({ ms: 350 })),
    ];

    expect(detectPushback(steady)).toBeNull();
  });
});
