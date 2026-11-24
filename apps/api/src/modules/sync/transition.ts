import type { EligibilityResult, LifecycleStatus } from './types.js';

export interface TransitionDecision {
  to: LifecycleStatus;
  /** Set only on the first move to PAID; the database trigger makes it set-once. */
  paymentVerifiedAt?: string;
  reason: 'NEW_ORDER' | 'ELIGIBLE' | 'CANCELLED';
}

/**
 * Which lifecycle change (if any) a fresh Shopify evaluation asks the lifecycle module for.
 * S1 scope: only pre-dispatch moves. Post-dispatch conflicts belong to slice S4.
 * Eligibility never regresses lifecycle: an already PAID order that turns ineligible stays PAID
 * (eligibility_status blocks dispatch instead).
 */
export function decideTransition(
  current: LifecycleStatus | null,
  evaluation: EligibilityResult,
  shopifyCancelled: boolean,
): TransitionDecision | null {
  if (current === null) {
    if (shopifyCancelled) return { to: 'CANCELLED', reason: 'NEW_ORDER' };
    if (evaluation.status === 'ELIGIBLE') {
      return { to: 'PAID', paymentVerifiedAt: evaluation.paymentVerifiedAt, reason: 'NEW_ORDER' };
    }
    return { to: 'PENDING_PAYMENT', reason: 'NEW_ORDER' };
  }
  if (shopifyCancelled && ['PENDING_PAYMENT', 'PAID', 'PREPARING'].includes(current)) {
    return { to: 'CANCELLED', reason: 'CANCELLED' };
  }
  if (current === 'PENDING_PAYMENT' && evaluation.status === 'ELIGIBLE') {
    return { to: 'PAID', paymentVerifiedAt: evaluation.paymentVerifiedAt, reason: 'ELIGIBLE' };
  }
  return null;
}
