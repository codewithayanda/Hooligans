import { parseForm, readBody, send, type Handler, type TwinModule } from '../shared/route.js';

const MAX_NAME = 200;

const TRACE = [
  "TypeError: Cannot read properties of undefined (reading 'trim')",
  '    at saveMessage (/srv/shop/src/contact.js:42:17)',
  '    at handleContact (/srv/shop/src/routes.js:18:5)',
  '    at Layer.handle [as handle_request] (/srv/shop/node_modules/express/lib/router/layer.js:95:5)',
].join('\n');

/**
 * The Fat Fingers twin: the contact form. The vulnerable twin crashes on a very long name and
 * shows a stack trace. The fixed twin checks the length and answers with a short message.
 */
export const fatFingers: TwinModule = {
  routes: (mode): Record<string, Handler> => ({
    'POST /api/contact': async (request, response) => {
      const fields = parseForm(await readBody(request));

      if ((fields.name ?? '').length > MAX_NAME) {
        if (mode === 'vuln') {
          send(response, 500, 'text/plain; charset=utf-8', TRACE);
        } else {
          send(response, 400, 'application/json', JSON.stringify({ error: 'The name is too long' }));
        }
        return;
      }

      response.statusCode = 204;
      response.end();
    },
  }),
};
