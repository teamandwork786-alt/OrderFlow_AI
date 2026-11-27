import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { usePricedCart } from "../controller/storefront.js";
import { formatPkr } from "../model/money.js";
import { BagLines } from "./bag-lines.js";

export function BagDrawer({ onClose }: { onClose: () => void }) {
  const priced = usePricedCart();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="sf-overlay" onClick={onClose}>
      <aside
        className="sf-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sf-drawer-head">
          <h2 id="bag-drawer-title">Your bag</h2>
          <button
            ref={closeButton}
            type="button"
            className="sf-link-button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        {priced.lines.length === 0 ? (
          <p className="sf-muted">Your bag is empty.</p>
        ) : (
          <>
            <BagLines
              lines={priced.lines}
              onQuantity={priced.cart.setQuantity}
              onRemove={priced.cart.remove}
            />
            <p className="sf-subtotal">
              <span>Subtotal</span>{" "}
              <strong>{formatPkr(priced.subtotalMinor)}</strong>
            </p>
            <div className="sf-drawer-actions">
              <Link
                className="sf-button sf-button-outline"
                to="/cart"
                onClick={onClose}
              >
                View bag
              </Link>
              <Link className="sf-button" to="/checkout" onClick={onClose}>
                Checkout
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
