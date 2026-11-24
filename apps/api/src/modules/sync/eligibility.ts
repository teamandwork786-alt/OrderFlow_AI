import { sumMinorUnits, toMinorUnits } from '../../lib/money.js';
import type { DomainShopifyOrder, EligibilityResult } from './types.js';

export const SUPPORTED_CURRENCY = 'PKR';

export interface EligibilityOptions {
  /** Optional gateway allowlist (SHOPIFY_ALLOWED_GATEWAYS). Unset means no gateway check. */
  allowedGateways?: string[];
}

const COD_RE = /cash[\s_-]*on[\s_-]*delivery|\(cod\)|^cod$/i;

/**
 * Pure payment-eligibility evaluation on FRESHLY FETCHED Shopify data (FR-02, architecture 10.2).
 *
 * Reason precedence when several rules fail (first match wins):
 * CANCELLED, REFUNDED_OR_VOIDED, ALREADY_FULFILLED, NOT_PAID, CURRENCY_MISMATCH,
 * COD_NOT_SUPPORTED, TEST_TRANSACTION, AMOUNT_MISMATCH, GATEWAY_NOT_ALLOWED.
 *
 * Transient fetch errors never reach this function, so they can never produce a permanent failure.
 */
export function evaluateEligibility(order: DomainShopifyOrder, options: EligibilityOptions = {}): EligibilityResult {
  if (order.cancelledAt) return { status: 'INELIGIBLE', reasonCode: 'CANCELLED' };

  const refundedOrVoided =
    order.refunds.length > 0 ||
    ['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED'].includes(order.financialStatus) ||
    order.transactions.some((t) => t.status === 'SUCCESS' && (t.kind === 'VOID' || t.kind === 'REFUND'));
  if (refundedOrVoided) return { status: 'INELIGIBLE', reasonCode: 'REFUNDED_OR_VOIDED' };

  if (order.fulfillments.some((f) => f.status !== 'CANCELLED')) {
    return { status: 'INELIGIBLE', reasonCode: 'ALREADY_FULFILLED' };
  }

  if (order.financialStatus !== 'PAID') return { status: 'INELIGIBLE', reasonCode: 'NOT_PAID' };

  if (order.currency !== SUPPORTED_CURRENCY) return { status: 'INELIGIBLE', reasonCode: 'CURRENCY_MISMATCH' };

  if (order.paymentGatewayNames.some((g) => COD_RE.test(g))) {
    return { status: 'INELIGIBLE', reasonCode: 'COD_NOT_SUPPORTED' };
  }

  const qualifying = order.transactions
    .filter((t) => t.status === 'SUCCESS' && (t.kind === 'SALE' || t.kind === 'CAPTURE'))
    .sort((a, b) => Date.parse(a.processedAt) - Date.parse(b.processedAt));

  if (qualifying.some((t) => t.test)) return { status: 'INELIGIBLE', reasonCode: 'TEST_TRANSACTION' };
  if (qualifying.some((t) => t.currency !== SUPPORTED_CURRENCY)) {
    return { status: 'INELIGIBLE', reasonCode: 'CURRENCY_MISMATCH' };
  }

  const total = toMinorUnits(order.totalAmount);
  if (qualifying.length === 0 || sumMinorUnits(qualifying.map((t) => t.amount)) !== total) {
    return { status: 'INELIGIBLE', reasonCode: 'AMOUNT_MISMATCH' };
  }

  if (options.allowedGateways && options.allowedGateways.length > 0) {
    const allowed = options.allowedGateways.map((g) => g.trim().toLowerCase());
    const gateways = new Set(qualifying.map((t) => t.gateway.trim().toLowerCase()));
    if ([...gateways].some((g) => !allowed.includes(g))) {
      return { status: 'INELIGIBLE', reasonCode: 'GATEWAY_NOT_ALLOWED' };
    }
  }

  // payment_verified_at: the transaction at which cumulative qualifying payments first reach the total.
  let running = 0;
  let verifiedAt = qualifying[qualifying.length - 1]!.processedAt;
  for (const t of qualifying) {
    running += toMinorUnits(t.amount);
    if (running >= total) {
      verifiedAt = t.processedAt;
      break;
    }
  }
  return { status: 'ELIGIBLE', paymentVerifiedAt: verifiedAt };
}
