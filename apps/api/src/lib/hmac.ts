import { createHmac, timingSafeEqual } from 'node:crypto';

/** Base64 HMAC-SHA256 of the raw request bytes, as Shopify sends in X-Shopify-Hmac-Sha256. */
export function signShopifyBody(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

/**
 * Constant-time check of the webhook signature over the RAW body bytes.
 * Returns false for a missing, malformed or wrong signature; never throws.
 */
export function verifyShopifyHmac(rawBody: Buffer, headerValue: string | undefined, secret: string): boolean {
  if (!headerValue || !secret) return false;
  const expected = Buffer.from(signShopifyBody(rawBody, secret), 'utf8');
  const received = Buffer.from(headerValue.trim(), 'utf8');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
