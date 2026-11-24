/** Shared guard for destructive scripts (PRD 18, architecture 14). */
export function assertDestructiveAllowed(action: string): void {
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    console.error(`Refusing to ${action}: set ALLOW_DESTRUCTIVE_SEED=true to confirm you want to change demo data.`);
    process.exit(1);
  }
  if ((process.env.SHOPIFY_ADAPTER ?? 'mock') === 'real') {
    console.error(`Refusing to ${action}: SHOPIFY_ADAPTER=real. This script never runs against a real Shopify-connected environment.`);
    process.exit(1);
  }
}
