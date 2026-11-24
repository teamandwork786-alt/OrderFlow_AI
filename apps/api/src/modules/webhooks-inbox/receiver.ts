import { verifyShopifyHmac } from '../../lib/hmac.js';
import type { AuditSink, InboxRepo } from './ports.js';

export const SUBSCRIBED_TOPICS = [
  'orders/create',
  'orders/paid',
  'orders/updated',
  'orders/cancelled',
  'fulfillments/create',
  'fulfillments/update',
  'refunds/create',
] as const;

export interface WebhookRequest {
  rawBody: Buffer;
  /** Header names lower-cased. */
  headers: Record<string, string | undefined>;
  /** Used only to throttle invalid-signature audit events (for example the remote address). */
  sourceKey: string;
}

export interface ReceiverDeps {
  secret: string;
  shopDomain: string;
  inbox: InboxRepo;
  audit: AuditSink;
  throttle: InvalidSignatureThrottle;
  subscribedTopics?: readonly string[];
}

export type ReceiverOutcome =
  | 'STORED'
  | 'DUPLICATE'
  | 'INVALID_SIGNATURE'
  | 'WRONG_SHOP'
  | 'TOPIC_NOT_SUBSCRIBED'
  | 'MALFORMED'
  | 'STORE_FAILED';

export interface ReceiverResponse {
  status: 200 | 400 | 401 | 500;
  outcome: ReceiverOutcome;
}

/** At most one invalid-signature audit event per source per window, with a count of suppressed ones. */
export class InvalidSignatureThrottle {
  private last = new Map<string, number>();
  private suppressed = new Map<string, number>();
  constructor(
    private windowMs = 60_000,
    private clock: () => number = Date.now,
  ) {}
  /** Returns { allow, suppressedCount }. suppressedCount is the number swallowed since the last allowed event. */
  check(key: string): { allow: boolean; suppressedCount: number } {
    const now = this.clock();
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.windowMs) {
      this.suppressed.set(key, (this.suppressed.get(key) ?? 0) + 1);
      return { allow: false, suppressedCount: 0 };
    }
    this.last.set(key, now);
    const count = this.suppressed.get(key) ?? 0;
    this.suppressed.set(key, 0);
    return { allow: true, suppressedCount: count };
  }
}

/** Resolve the Shopify order ID a webhook is about. orders/* carry `id`; fulfillments and refunds carry `order_id`. */
export function resolveResourceId(topic: string, payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const raw = topic.startsWith('orders/') ? p.id : p.order_id;
  if (typeof raw === 'number' || typeof raw === 'string') return String(raw);
  return null;
}

/**
 * Webhook receiver (architecture 10.1, API-process half). Verify, store durably, acknowledge.
 * No Shopify call and no business processing happens in the request.
 */
export async function handleWebhook(req: WebhookRequest, deps: ReceiverDeps): Promise<ReceiverResponse> {
  const h = req.headers;

  if (!verifyShopifyHmac(req.rawBody, h['x-shopify-hmac-sha256'], deps.secret)) {
    const t = deps.throttle.check(req.sourceKey);
    if (t.allow) {
      // No payload and no headers are recorded. Only a count of suppressed repeats.
      await deps.audit.record({
        eventType: 'WEBHOOK_SIGNATURE_INVALID',
        actorType: 'SYSTEM',
        details: { suppressed_since_last: t.suppressedCount },
      });
    }
    return { status: 401, outcome: 'INVALID_SIGNATURE' };
  }

  if (h['x-shopify-shop-domain'] !== deps.shopDomain) return { status: 400, outcome: 'WRONG_SHOP' };

  const topic = h['x-shopify-topic'] ?? '';
  if (!(deps.subscribedTopics ?? SUBSCRIBED_TOPICS).includes(topic)) return { status: 400, outcome: 'TOPIC_NOT_SUBSCRIBED' };

  const webhookId = h['x-shopify-webhook-id'];
  let payload: unknown;
  try {
    payload = JSON.parse(req.rawBody.toString('utf8'));
  } catch {
    payload = undefined;
  }
  if (!webhookId || payload === undefined) return { status: 400, outcome: 'MALFORMED' };

  const triggered = h['x-shopify-triggered-at'] ? new Date(h['x-shopify-triggered-at']!) : null;
  try {
    const stored = await deps.inbox.insertIfAbsent({
      shopifyWebhookId: webhookId,
      shopifyEventId: h['x-shopify-event-id'] ?? null,
      topic,
      shopDomain: deps.shopDomain,
      apiVersion: h['x-shopify-api-version'] ?? null,
      shopifyTriggeredAt: triggered && !Number.isNaN(triggered.getTime()) ? triggered : null,
      resourceId: resolveResourceId(topic, payload),
      payload,
    });
    // A duplicate is acknowledged with 200 whatever its status: the worker owns retries.
    return { status: 200, outcome: stored ? 'STORED' : 'DUPLICATE' };
  } catch {
    return { status: 500, outcome: 'STORE_FAILED' }; // Shopify will redeliver
  }
}
