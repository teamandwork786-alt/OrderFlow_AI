import type { ShopifyAdapter } from '../../integrations/shopify/adapter.js';
import { applyFetchedOrder, type ProcessorDeps } from '../webhooks-inbox/processor.js';
import type { OrderRepo } from '../webhooks-inbox/ports.js';

export const DEFAULT_RECONCILE_WINDOW_HOURS = 48;

export interface ReconcileSummary {
  refreshed: number;
  ignoredOlder: number;
  failed: number;
}

/**
 * Reconciliation job (architecture 10.11): refresh from CURRENT Shopify state every order Shopify reports
 * updated in the window, PLUS every local actionable order regardless of age. It never replays old payloads.
 * One failing order does not stop the others; failures are counted and retried on the next cycle.
 */
export async function reconcile(
  deps: Pick<ProcessorDeps, 'orders' | 'now' | 'eligibility'> & { adapter: ShopifyAdapter; orders: OrderRepo },
  windowHours = DEFAULT_RECONCILE_WINDOW_HOURS,
): Promise<ReconcileSummary> {
  const since = new Date(deps.now().getTime() - windowHours * 3_600_000);
  const ids = new Set<string>(await deps.orders.listActionableShopifyIds());
  let cursor: string | undefined;
  do {
    const page = await deps.adapter.listOrdersUpdatedSince(since, cursor);
    page.items.forEach((id) => ids.add(id));
    cursor = page.nextCursor;
  } while (cursor);

  const summary: ReconcileSummary = { refreshed: 0, ignoredOlder: 0, failed: 0 };
  for (const id of ids) {
    try {
      const outcome = await applyFetchedOrder(await deps.adapter.getOrder(id), deps);
      if (outcome === 'PROCESSED') summary.refreshed++;
      else summary.ignoredOlder++;
    } catch {
      summary.failed++;
    }
  }
  return summary;
}
