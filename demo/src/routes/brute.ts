import { readBody, send, type Handler, type Mode, type TwinModule } from '../shared/route.js';

const LIMIT = 5;
const WINDOW_MS = 60_000;

/** The page script of the single page login. It sends the login as JSON, the way most apps do. */
const APP_LOGIN_SCRIPT = `var form = document.getElementById('signin');
var result = document.getElementById('signin-result');

form.addEventListener('submit', function (event) {
  event.preventDefault();

  fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('signin-email').value,
      password: document.getElementById('signin-password').value,
    }),
  })
    .then(function (response) {
      result.textContent = response.ok ? 'Signed in' : 'Wrong email or password';
    })
    .catch(function () {
      result.textContent = 'Could not reach the app';
    });
});
`;

/**
 * Wraps a route. The fixed twin turns away anyone who calls it more than a few times a minute,
 * with a 429 and a Retry-After header. The vulnerable twin never does.
 */
function limited(mode: Mode, answer: Handler): Handler {
  const calls: number[] = [];

  return async (request, response, context) => {
    await readBody(request);

    const now = Date.now();
    while (calls.length > 0 && now - (calls[0] ?? now) > WINDOW_MS) calls.shift();
    calls.push(now);

    if (mode === 'fixed' && calls.length > LIMIT) {
      response.setHeader('retry-after', '60');
      const message = JSON.stringify({ error: 'Too many attempts. Try again in a minute.' });
      send(response, 429, 'application/json', message);
      return;
    }

    await answer(request, response, context);
  };
}

function json(status: number, body: unknown): Handler {
  return (_request, response) => send(response, status, 'application/json', JSON.stringify(body));
}

/** The Brute twin: login, signup and password reset, with and without a limit on attempts. */
export const brute: TwinModule = {
  routes: (mode): Record<string, Handler> => ({
    'POST /api/login': limited(mode, json(401, { error: 'Wrong email or password' })),
    'POST /api/session': limited(mode, json(401, { error: 'Wrong email or password' })),
    'POST /api/signup': limited(mode, json(201, { ok: true })),
    'POST /api/forgot': limited(mode, json(202, { ok: true })),

    'GET /assets/app-login.js': (_request, response) =>
      send(response, 200, 'text/javascript; charset=utf-8', APP_LOGIN_SCRIPT),
  }),
};
