import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** Parsed and validated at startup; the process refuses to start on invalid configuration. */
const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    SHOPIFY_ADAPTER: z.enum(['mock', 'real']).default('mock'),
    // Required in BOTH modes: the simulator signs with the same secret the receiver verifies with.
    SHOPIFY_SHOP_DOMAIN: z.string().min(1),
    SHOPIFY_APP_SECRET: z.string().min(1),
    SHOPIFY_API_VERSION: z.string().optional(),
    SHOPIFY_ADMIN_TOKEN: z.string().optional(),
    SHOPIFY_NOTIFY_CUSTOMER: bool,
    SHOPIFY_ALLOWED_GATEWAYS: z.string().optional(),
    SHOPIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    STALE_AFTER_MINUTES: z.coerce.number().int().positive().default(15),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    RECONCILE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
    RECONCILE_WINDOW_HOURS: z.coerce.number().int().positive().default(48),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.string().default('info'),
  })
  .superRefine((v, ctx) => {
    if (v.SHOPIFY_ADAPTER === 'real') {
      for (const k of ['SHOPIFY_API_VERSION', 'SHOPIFY_ADMIN_TOKEN'] as const) {
        if (!v[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when SHOPIFY_ADAPTER=real` });
      }
    }
  });

export type Env = z.infer<typeof schema>;
export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => schema.parse(source);
