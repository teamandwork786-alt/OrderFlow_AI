import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { StorefrontProduct } from "@orderflow/shared";
import { useCurrentUser } from "../controller/auth.js";
import { useCart } from "../controller/cart-store.js";
import { usePageTitle } from "../controller/page.js";
import { useProducts } from "../controller/storefront.js";
import { formatPkr, parseMoney } from "../model/money.js";
import { QuickView } from "./quick-view.js";
import { CategoryTile } from "./storefront-art.js";
import { StorefrontShell } from "./storefront-shell.js";

export function ShopPage() {
  usePageTitle("Shop · Ghar ki Ronak");
  const { data: user } = useCurrentUser();
  const products = useProducts();
  const cart = useCart();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [quick, setQuick] = useState<StorefrontProduct | null>(null);
  const [notice, setNotice] = useState("");

  const categories = useMemo(
    () => [
      "All",
      ...new Set((products.data ?? []).map((item) => item.category))
    ],
    [products.data]
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (item) =>
        (category === "All" || item.category === category) &&
        (!term || item.title.toLowerCase().includes(term))
    );
  }, [products.data, category, search]);

  if (user && !user.roles.includes("customer"))
    return <Navigate to="/no-access" replace />;

  function add(product: StorefrontProduct): void {
    cart.add(product.id);
    setNotice(`${product.title} was added to your bag.`);
  }

  return (
    <StorefrontShell>
      <main>
        <section className="sf-hero">
          <div className="sf-wrap sf-hero-inner">
            <p className="sf-eyebrow">Ghar ki Ronak</p>
            <h1>Ghar ki Ronak</h1>
            <p className="sf-lead">
              Mirrors, lamps, glass and greenery chosen to bring warmth into a
              room. Order online and follow your parcel from our door to yours.
            </p>
          </div>
        </section>

        <section className="sf-wrap" aria-labelledby="catalogue-title">
          <h2 id="catalogue-title" className="sf-section-title">
            The collection
          </h2>
          <div className="sf-toolbar">
            <div className="sf-pills" role="group" aria-label="Categories">
              {categories.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={
                    name === category ? "sf-pill is-active" : "sf-pill"
                  }
                  aria-pressed={name === category}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="sf-search"
              aria-label="Search products"
              placeholder="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="sf-unit" role="group" aria-label="Dimension unit">
              {(["cm", "in"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={unit === value ? "is-active" : undefined}
                  aria-pressed={unit === value}
                  onClick={() => setUnit(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <p className="sf-visually-hidden" role="status">
            {notice}
          </p>

          {products.isPending && (
            <p className="sf-muted" role="status">
              Checking availability…
            </p>
          )}
          {products.isError && (
            <p className="form-error" role="alert">
              The collection could not be loaded. Refresh the page to try again.
            </p>
          )}
          {products.data && visible.length === 0 && (
            <p className="sf-muted">No products match your search.</p>
          )}
          <div className="sf-grid">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                unit={unit}
                onAdd={() => add(product)}
                onQuickView={() => setQuick(product)}
              />
            ))}
          </div>
        </section>
      </main>
      {quick && (
        <QuickView
          product={quick}
          unit={unit}
          onAdd={() => {
            add(quick);
            setQuick(null);
          }}
          onClose={() => setQuick(null)}
        />
      )}
    </StorefrontShell>
  );
}

interface ProductCardProps {
  product: StorefrontProduct;
  unit: "cm" | "in";
  onAdd: () => void;
  onQuickView: () => void;
}

function ProductCard({ product, unit, onAdd, onQuickView }: ProductCardProps) {
  const available = product.availability === "AVAILABLE" && !product.is_held;
  return (
    <article className="sf-card">
      <CategoryTile category={product.category} />
      <div className="sf-card-body">
        <p className="sf-eyebrow">{product.category}</p>
        <h3>{product.title}</h3>
        <p className="sf-muted">
          {unit === "cm" ? product.dimensions_cm : product.dimensions_in}
        </p>
        <p className="sf-price">{formatPkr(parseMoney(product.price))}</p>
        {!available && <p className="sf-badge sf-badge-warn">Out of stock</p>}
        <div className="sf-card-actions">
          <button
            type="button"
            className="sf-button"
            disabled={!available}
            onClick={onAdd}
          >
            Add to bag
          </button>
          <button
            type="button"
            className="sf-button sf-button-outline"
            onClick={onQuickView}
          >
            Quick view
          </button>
        </div>
      </div>
    </article>
  );
}
