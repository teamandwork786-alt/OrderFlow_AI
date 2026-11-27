import { useEffect, useRef } from "react";
import type { StorefrontProduct } from "@orderflow/shared";
import { formatPkr, parseMoney } from "../model/money.js";
import { CategoryTile } from "./storefront-art.js";

interface QuickViewProps {
  product: StorefrontProduct;
  unit: "cm" | "in";
  onAdd: (productId: string) => void;
  onClose: () => void;
}

export function QuickView({ product, unit, onAdd, onClose }: QuickViewProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const available = product.availability === "AVAILABLE" && !product.is_held;

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
      <div
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sf-modal-art">
          <CategoryTile category={product.category} />
        </div>
        <div className="sf-modal-body">
          <p className="sf-eyebrow">{product.category}</p>
          <h2 id="quick-view-title">{product.title}</h2>
          <p className="sf-price">{formatPkr(parseMoney(product.price))}</p>
          <p>{product.description}</p>
          <dl className="sf-facts">
            <dt>Finish</dt>
            <dd>{product.finish}</dd>
            <dt>Size</dt>
            <dd>
              {unit === "cm" ? product.dimensions_cm : product.dimensions_in}
            </dd>
            <dt>SKU</dt>
            <dd>{product.sku}</dd>
          </dl>
          <div className="sf-modal-actions">
            <button
              type="button"
              className="sf-button"
              disabled={!available}
              onClick={() => onAdd(product.id)}
            >
              {available ? "Add to bag" : "Out of stock"}
            </button>
            <button
              ref={closeButton}
              type="button"
              className="sf-button sf-button-outline"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
