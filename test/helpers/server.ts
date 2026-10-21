import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type TestServer = {
  origin: string;
  port: number;
  hits: () => number;
  close: () => Promise<void>;
};

/** A small server on a free loopback port that counts how often it is called. */
export async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  let count = 0;
  const server = createServer((request, response) => {
    count += 1;
    handler(request, response);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    hits: () => count,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
