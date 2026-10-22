import { send, type Handler, type TwinModule } from '../shared/route.js';

const ORDERS = [{ id: 1, user_id: 'u-1001', email: 'jane@example.com', total: 129.5 }];
const USERS = [{ id: 1, email: 'jane@example.com', role: 'admin' }];
const SETTINGS = {
  activeProfiles: [],
  propertySources: [{ name: 'systemEnvironment', properties: {} }],
};

/** The Door Rattler twin: a Supabase style table, a private route and a debug page. */
export const doorRattler: TwinModule = {
  routes: (mode): Record<string, Handler> => ({
    'GET /rest/v1/orders': (request, response) => {
      if (!request.headers.apikey) {
        const message = JSON.stringify({ message: 'No API key found in request' });
        send(response, 401, 'application/json', message);
        return;
      }

      // Row level security is off in the vulnerable twin. In the fixed twin it is on, so a
      // request with no login sees no rows.
      send(response, 200, 'application/json', JSON.stringify(mode === 'vuln' ? ORDERS : []));
    },

    'GET /api/users': (_request, response) => {
      if (mode === 'vuln') {
        send(response, 200, 'application/json', JSON.stringify(USERS));
      } else {
        send(response, 401, 'application/json', JSON.stringify({ error: 'Unauthorized' }));
      }
    },

    ...(mode === 'vuln'
      ? {
          'GET /actuator/env': (_request, response) =>
            send(response, 200, 'application/json', JSON.stringify(SETTINGS)),
        }
      : {}),
  }),
};
