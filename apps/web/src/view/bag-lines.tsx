import { MAX_QUANTITY } from "../model/cart.js";
import { formatPkr, parseMoney } from "../model/money.js";
import type { PricedLine } from "../controller/storefront.js";
import { CategoryTile } from "./storefront-art.js";

interface BagLinesProps {
  lines: PricedLine[];
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

/** The editable list of bag lines, shared by the drawer and the bag page. */
export function BagLines({ lines, onQuantity, onRemove }: BagLinesProps) {
  return (
    <ul className="sf-lines">
      {lines.map(({ product, quantity, lineMinor }) => {
        const blocked = product.availability !== "AVAILABLE" || product.is_held;
        return (
          <li key={product.id} className="sf-line">
            <div className="sf-line-art">
              <CategoryTile category={product.category} />
            </div>
            <div className="sf-line-body">
              <p className="sf-line-title">{product.title}</p>
              <p className="sf-muted">
                {formatPkr(parseMoney(product.price))} each
              </p>
              {blocked && (
                <p className="sf-badge sf-badge-warn">No longer available</p>
              )}
              <div className="sf-qty">
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${product.title}`}
                  onClick={() => onQuantity(product.id, quantity - 1)}
                >
                  −
                </button>
                <span aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  aria-label={`Increase quantity of ${product.title}`}
                  disabled={quantity >= MAX_QUANTITY}
                  onClick={() => onQuantity(product.id, quantity + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="sf-link-button"
                  onClick={() => onRemove(product.id)}
                >
                  Remove
                </button>
              </div>
            </div>
            <p className="sf-line-total">{formatPkr(lineMinor)}</p>
          </li>
        );
      })}
    </ul>
  );
}
