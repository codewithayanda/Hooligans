export type PageInfo = {
  url: string;
  status: number;
  headers: Record<string, string>;
};

export type FormInfo = {
  page: string;
  action: string;
  method: string;
  fields: { name: string; type: string }[];
};

export type CallInfo = {
  method: string;
  url: string;
  status: number;
  /** Whether the call carried cookies or an authorization header. */
  sentAuth: boolean;
};

export type AssetInfo = {
  url: string;
  kind: 'script' | 'sourcemap' | 'other';
};

export type CookieInfo = {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
};

/** Found in robots.txt, a sitemap or an OpenAPI file. Noted, not visited. */
export type Lead = {
  url: string;
  why: string;
};

export type Coverage = {
  pages: number;
  forms: number;
  calls: number;
  /** What the Scout chose not to touch, and why. */
  skipped: string[];
};

/** What the Scout writes and every hooligan reads. */
export type AppMap = {
  entry: string;
  mode: 'dev' | 'prod' | 'unknown';
  stack: { framework?: string; backends: string[] };
  pages: PageInfo[];
  forms: FormInfo[];
  calls: CallInfo[];
  assets: AssetInfo[];
  cookies: CookieInfo[];
  leads: Lead[];
  externalHosts: string[];
  coverage: Coverage;
};
