import type { ShopifyAdapter } from '../../integrations/shopify/adapter.js';
import { evaluateEligibility, type EligibilityOptions } from '../sync/eligibility.js';
import { decideTransition } from '../sync/transition.js';
import { ShopifyPermanentError, type DomainShopifyOrder } from '../sync/types.js';
import type { AuditSink, InboxItem, InboxRepo, OrderRepo } from './ports.js';
import { DEFAULT_MAX_ATTEMPTS, isDeadLetter, nextRetryDelayMs } from './retry.js';

export interface ProcessorDeps {
  adapter: ShopifyAdapter;
  orders: OrderRepo;
  inbox: InboxRepo;
  audit: AuditSink;
  now: () => Date;
  random?: () => number;
  eligibility?: EligibilityOptions;
  maxAttempts?: number;
}

export type ProcessOutcome = 'PROCESSED' | 'IGNORED_OLDER' | 'FAILED_RETRY' | 'DEAD_LETTER';

/**
 * Worker half of webhook handling (architecture 10.1 worker steps 2 to 6) for one claimed inbox item.
 * The webhook payload is only a hint: the CURRENT order is always fetched through the adapter.
 */
export async function processInboxItem(item: InboxItem, deps: ProcessorDeps): Promise<ProcessOutcome> {
  const now = deps.now();
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (!item.resourceId) {
    await deps.inbox.markDeadLetter(item.id, item.attemptCount, 'MALFORMED_PAYLOAD', 'no order id in webhook');
    return 'DEAD_LETTER';
  }

  let order;
  try {
    order = await deps.adapter.getOrder(item.resourceId);
  } catch (err) {
    if (err instanceof ShopifyPermanentError) {
      await deps.inbox.markDeadLetter(item.id, item.attemptCount + 1, err.code, err.message);
      return 'DEAD_LETTER';
    }
    // Anything else is treated as transient: retry with backoff, never a permanent business outcome.
    const failed = item.attemptCount + 1;
    const code = (err as { code?: string }).code ?? 'TRANSIENT_ERROR';
    const message = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
    if (isDeadLetter(failed, maxAttempts)) {
      await deps.inbox.markDeadLetter(item.id, failed, code, message);
      return 'DEAD_LETTER';
    }
    const next = new Date(now.getTime() + nextRetryDelayMs(failed, deps.random));
    await deps.inbox.markFailed(item.id, failed, next, code, message);
    return 'FAILED_RETRY';
  }

  const outcome = await applyFetchedOrder(order, deps);
  await deps.inbox.markProcessed(item.id, now);
  return outcome;
}

/**
 * Evaluate and store an already-fetched order (shared by the webhook worker and reconciliation).
 * An older result never overwrites newer data; an equal timestamp re-runs evaluation idempotently.
 */
export async function applyFetchedOrder(
  order: DomainShopifyOrder,
  deps: Pick<ProcessorDeps, 'orders' | 'now' | 'eligibility'>,
): Promise<'PROCESSED' | 'IGNORED_OLDER'> {
  const stored = await deps.orders.getByShopifyId(order.shopifyOrderId);
  if (stored && new Date(order.updatedAt).getTime() < stored.shopifyUpdatedAt.getTime()) return 'IGNORED_OLDER';
  const evaluation = evaluateEligibility(order, deps.eligibility);
  const transition = decideTransition(stored?.lifecycleStatus ?? null, evaluation, order.cancelledAt !== null);
  await deps.orders.applySync({ order, evaluation, transition, isNew: stored === null, now: deps.now() });
  return 'PROCESSED';
}

/** One worker tick: claim due items and process each. Returns outcomes for logging and tests. */
export async function runWorkerTick(deps: ProcessorDeps, limit = 10, leaseMs = 120_000): Promise<ProcessOutcome[]> {
  const items = await deps.inbox.claimDue(deps.now(), limit, leaseMs);
  const results: ProcessOutcome[] = [];
  for (const item of items) results.push(await processInboxItem(item, deps));
  return results;
}
