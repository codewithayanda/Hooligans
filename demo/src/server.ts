import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { brute } from './routes/brute.js';
import { doorRattler } from './routes/door-rattler.js';
import { fatFingers } from './routes/fat-fingers.js';
import { loudmouth } from './routes/loudmouth.js';
import { pickpocket } from './routes/pickpocket.js';
import { theMob } from './routes/the-mob.js';
import { vandal } from './routes/vandal.js';
import {
  send,
  type DemoContext,
  type Handler,
  type Mode,
  type TwinModule,
} from './shared/route.js';
import { productPage, sharedRoutes } from './shared/site.js';

const TWINS: readonly TwinModule[] = [
  loudmouth,
  pickpocket,
  doorRattler,
  fatFingers,
  vandal,
  brute,
  theMob,
];

export type DemoOptions = {
  mode: Mode;
  /** Defaults to a free port. */
  port?: number;
  /** Pretends to be a dev server, with the tell-tale script of one. */
  devServer?: boolean;
};

export type Demo = {
  mode: Mode;
  origin: string;
  port: number;
  /** How often a path was requested, whatever the method. */
  hits: (path: string) => number;
  close: () => Promise<void>;
};

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  context: DemoContext,
  table: Record<string, Handler>,
  hits: Map<string, number>,
): Promise<void> {
  request.resume();

  const method = request.method ?? 'GET';
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  hits.set(path, (hits.get(path) ?? 0) + 1);

  const origin = request.headers.origin;

  for (const twin of TWINS) {
    for (const [name, value] of Object.entries(twin.headers?.(context.mode, path, origin) ?? {})) {
      response.setHeader(name, value);
    }
  }

  try {
    const handler = table[`${method} ${path}`] ?? productPage(method, path);

    if (handler) await handler(request, response, context);
    else send(response, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch {
    send(response, 500, 'text/plain; charset=utf-8', 'Something went wrong');
  }
}

/** Starts one twin of the demo on 127.0.0.1. It never listens on anything else. */
export async function startDemo(options: DemoOptions): Promise<Demo> {
  const hits = new Map<string, number>();
  let origin = '';

  const context: DemoContext = {
    mode: options.mode,
    devServer: options.devServer === true,
    origin: () => origin,
  };

  const table: Record<string, Handler> = { ...sharedRoutes() };
  for (const twin of TWINS) Object.assign(table, twin.routes?.(options.mode) ?? {});

  const server = createServer((request, response) => {
    void handle(request, response, context, table, hits);
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;

  return {
    mode: options.mode,
    origin,
    port,
    hits: (path) => hits.get(path) ?? 0,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const entry = process.argv[1];

if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const vulnerable = await startDemo({ mode: 'vuln', port: 4001 });
  const fixed = await startDemo({ mode: 'fixed', port: 4002 });

  console.log('Hooligans demo. Deliberately weak: never deploy it.');
  console.log(`  vulnerable twin: ${vulnerable.origin}`);
  console.log(`  fixed twin:      ${fixed.origin}`);
}
