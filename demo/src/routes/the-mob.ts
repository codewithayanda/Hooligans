import { PRODUCTS } from '../shared/db.js';
import { send, type Handler, type Mode, type TwinModule } from '../shared/route.js';

/** How many requests the database can serve at once, and how long one takes. */
const SLOTS: Readonly<Record<Mode, number>> = { vuln: 3, fixed: 8 };
const WORK_MS: Readonly<Record<Mode, number>> = { vuln: 700, fixed: 20 };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A small pool of database connections. The vulnerable twin turns a request away when every
 * connection is busy, which is what a pool that is too small does. The fixed twin makes it wait.
 */
function createPool(mode: Mode) {
  let busy = 0;
  const line: (() => void)[] = [];

  return {
    async enter(): Promise<boolean> {
      if (busy < SLOTS[mode]) {
        busy += 1;
        return true;
      }
      if (mode === 'vuln') return false;

      await new Promise<void>((resolve) => line.push(resolve));
      return true;
    },
    leave(): void {
      const next = line.shift();
      if (next) next();
      else busy -= 1;
    },
  };
}

function query(mode: Mode, pool: ReturnType<typeof createPool>, answer: () => unknown): Handler {
  return async (_request, response) => {
    if (!(await pool.enter())) {
      const message = JSON.stringify({ error: 'remaining connection slots are reserved' });
      send(response, 503, 'application/json', message);
      return;
    }

    try {
      await wait(WORK_MS[mode]);
      send(response, 200, 'application/json', JSON.stringify(answer()));
    } finally {
      pool.leave();
    }
  };
}

/** The Mob twin: three calls that share one pool of connections, which is the weak spot. */
export const theMob: TwinModule = {
  routes: (mode): Record<string, Handler> => {
    const pool = createPool(mode);

    return {
      'GET /api/products': query(mode, pool, () => PRODUCTS),
      'GET /api/stats': query(mode, pool, () => ({ visitors: 1204 })),
      'GET /api/activity': query(mode, pool, () => [{ id: 1, text: 'Someone bought a Widget' }]),
    };
  },
};
