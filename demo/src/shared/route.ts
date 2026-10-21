import type { IncomingMessage, ServerResponse } from 'node:http';

export type Mode = 'vuln' | 'fixed';

/** What a handler is told about the demo it belongs to. */
export type DemoContext = {
  mode: Mode;
  devServer: boolean;
  origin: () => string;
};

export type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  context: DemoContext,
) => void | Promise<void>;

/** One hooligan's side of the demo: headers for every response, and routes of its own. */
export type TwinModule = {
  headers?: (mode: Mode, path: string, origin: string | undefined) => Record<string, string>;
  routes?: (mode: Mode) => Record<string, Handler>;
};

export function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
): void {
  response.statusCode = status;
  response.setHeader('content-type', contentType);
  response.end(body);
}
