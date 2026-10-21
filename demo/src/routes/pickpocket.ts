import { appCode } from '../shared/app-code.js';
import { send, type Handler, type Mode, type TwinModule } from '../shared/route.js';

const BUNDLE = '/assets/index-4f2a9c1b.js';

/** Built when the server runs, so no key-shaped text sits in the source. */
function fakeStripeKey(): string {
  return ['sk', 'live', 'x'.repeat(24)].join('_');
}

function bundle(mode: Mode): string {
  if (mode === 'fixed') return appCode();

  return `${appCode()}
var config = { stripeSecretKey: '${fakeStripeKey()}' };
//# sourceMappingURL=index-4f2a9c1b.js.map
`;
}

/** The Pickpocket twin: what the app leaves lying around in its public files. */
export const pickpocket: TwinModule = {
  routes: (mode): Record<string, Handler> => ({
    [`GET ${BUNDLE}`]: (_request, response) =>
      send(response, 200, 'text/javascript; charset=utf-8', bundle(mode)),

    ...(mode === 'vuln'
      ? {
          [`GET ${BUNDLE}.map`]: (_request, response) =>
            send(
              response,
              200,
              'application/json',
              JSON.stringify({ version: 3, sources: ['src/main.ts'], names: [], mappings: '' }),
            ),
          'GET /.env': (_request, response) =>
            send(
              response,
              200,
              'text/plain; charset=utf-8',
              `STRIPE_SECRET_KEY=${fakeStripeKey()}\nDATABASE_URL=postgres://app:hunter2@localhost:5432/app\n`,
            ),
          'GET /.git/config': (_request, response) =>
            send(response, 200, 'text/plain; charset=utf-8', '[core]\n\trepositoryformatversion = 0\n'),
        }
      : {}),
  }),
};
