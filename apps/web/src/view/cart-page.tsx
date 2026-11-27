import { Link, Navigate } from "react-router-dom";
import { useCurrentUser } from "../controller/auth.js";
import { usePageTitle } from "../controller/page.js";
import { usePricedCart } from "../controller/storefront.js";
import { formatPkr } from "../model/money.js";
import { BagLines } from "./bag-lines.js";
import { StorefrontShell } from "./storefront-shell.js";

export function CartPage() {
  usePageTitle("Your bag · Ghar ki Ronak");
  const { data: user } = useCurrentUser();
  const priced = usePricedCart();

  if (user && !user.roles.includes("customer"))
    return <Navigate to="/no-access" replace />;

  return (
    <StorefrontShell>
      <main className="sf-wrap sf-narrow">
        <h1 className="sf-page-title">Your bag</h1>
        {priced.products.isPending && (
          <p className="sf-muted" role="status">
            Checking availability…
          </p>
        )}
        {priced.removedCount > 0 && (
          <p className="sf-badge sf-badge-warn" role="status">
            Some items are no longer sold and were removed from your bag.
          </p>
        )}
        {priced.lines.length === 0 && !priced.products.isPending ? (
          <section className="sf-empty">
            <p>Your bag is empty.</p>
            <Link className="sf-button" to="/shop">
              Continue shopping
            </Link>
          </section>
        ) : (
          <>
            <BagLines
              lines={priced.lines}
              onQuantity={priced.cart.setQuantity}
              onRemove={priced.cart.remove}
            />
            <p className="sf-subtotal">
              <span>Subtotal</span>
              <strong data-testid="cart-total">
                {formatPkr(priced.subtotalMinor)}
              </strong>
            </p>
            <p className="sf-muted">Delivery is confirmed at checkout.</p>
            <div className="sf-drawer-actions">
              <Link className="sf-button sf-button-outline" to="/shop">
                Continue shopping
              </Link>
              {priced.unavailable.length > 0 ? (
                <button type="button" className="sf-button" disabled>
                  Checkout
                </button>
              ) : (
                <Link className="sf-button" to="/checkout">
                  Checkout
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </StorefrontShell>
  );
}
