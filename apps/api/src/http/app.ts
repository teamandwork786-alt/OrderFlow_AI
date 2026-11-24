// Express composition. NOT compiled in the authoring sandbox (Express could not be installed there).
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Permission } from '@orderflow/shared';
import { selectOrders, type OrderFilter, type OrderListRow } from '../modules/orders-query/listOrders.js';
import { handleWebhook, type ReceiverDeps } from '../modules/webhooks-inbox/receiver.js';

export interface AuthContext {
  userId: string;
  permissions: ReadonlySet<Permission>;
}

export interface AppDeps {
  receiver: ReceiverDeps;
  /** Slice S0 provides this (OIDC token or session validation). Returns null when unauthenticated. */
  authenticate: (req: Request) => Promise<AuthContext | null>;
  listRows: () => Promise<OrderListRow[]>;
  databaseHealthy: () => Promise<boolean>;
}

const FILTERS: OrderFilter[] = ['pending', 'dispatched', 'completed', 'needs_attention'];

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // The webhook route MUST be mounted with express.raw BEFORE any express.json(): the HMAC is over the raw bytes.
  app.post('/webhooks/shopify', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
    const out = await handleWebhook(
      { rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), headers, sourceKey: req.ip ?? 'unknown' },
      deps.receiver,
    );
    res.status(out.status).json({ outcome: out.outcome });
  });

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    const db = await deps.databaseHealthy().catch(() => false);
    res.status(db ? 200 : 503).json({ application: 'ok', database: db ? 'ok' : 'unavailable' });
  });

  const requirePermission = (permission: Permission) => async (req: Request, res: Response, next: NextFunction) => {
    const auth = await deps.authenticate(req);
    if (!auth) return void res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } });
    if (!auth.permissions.has(permission)) return void res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not permitted' } });
    next();
  };

  app.get('/api/v1/orders', requirePermission('orders.read'), async (req, res) => {
    const filter = FILTERS.includes(req.query.filter as OrderFilter) ? (req.query.filter as OrderFilter) : undefined;
    const num = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : undefined);
    const page = selectOrders(await deps.listRows(), {
      filter,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: num(req.query.page),
      pageSize: num(req.query.pageSize),
    });
    res.json({
      items: page.items.map(({ createdAt, ...r }) => ({ ...r, createdAt: createdAt.toISOString() })),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    });
  });

  return app;
}
