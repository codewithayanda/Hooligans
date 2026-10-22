import { send, type Handler, type TwinModule } from '../shared/route.js';

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Search</title>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * The Vandal twin: a search page. The vulnerable twin shows what was typed as raw HTML, and
 * answers a stray quote with a database error. The fixed twin escapes the text.
 */
export const vandal: TwinModule = {
  routes: (mode): Record<string, Handler> => ({
    'GET /search': (request, response) => {
      const term = new URL(request.url ?? '/', 'http://localhost').searchParams.get('q') ?? '';

      if (mode === 'vuln' && term.includes("'")) {
        const error = `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${term}' at line 1`;
        send(response, 500, 'text/plain; charset=utf-8', error);
        return;
      }

      const shown = mode === 'vuln' ? term : escapeHtml(term);
      const body = `<h1>Results for ${shown}</h1>\n<p>No products matched.</p>`;
      send(response, 200, 'text/html; charset=utf-8', page(body));
    },
  }),
};
