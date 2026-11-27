# OrderFlow AI — Slice 1A Summary & Slice 1B Spec (PRD v4.4 + Formrest Storefront UI)

## 1. Current Repository State (Post-Slice 1A)
- **Branch / Latest Commit:** `feat/customer-sign-in-modes` (`73be42d` plus `plan.md` Gate 1, Slice 1A, and Slice 1B human sign-offs in Section 9).
- **Tech Baseline (`PRD.md` §13):** TypeScript strict, Node 22, **Express**, Zod, PostgreSQL 16, **Prisma** with custom SQL triggers/constraints/grants, React 18, Vite, React Router, TanStack Query, **plain CSS** (no Tailwind/CSS framework), Vitest, Supertest, Playwright, Docker Compose (`--env-file .env.example`).
- **Completed in Slice 1A (`0001_identity`):**
  - Self-hosted OIDC Identity Provider (`apps/mock-oidc` on `:4000`) with PKCE Authorization Code flow integrated into `apps/api` (`:3000`) and `apps/web` (`:5173`).
  - Clean email/password sign-in (`mode=sign-in`), custom-password customer registration (`mode=sign-up`), and simulated Google/Apple customer logins via `login_hint`.
  - RBAC roles/permissions (`owner`, `admin`, `staff_picker_packer`, `staff_inspector`, `staff_full`, `cap_*`, `customer`), append-only `audit_events`, and `grants.sql` (`orderflow_owner`, `orderflow_app`, `orderflow_ro`).

---

## 2. Exact Slice 1B Deliverables (`plan.md` §4 & `PRD.md` v4.4)

### A. Database Migration (`0002_orders`)
Create additive forward-only migration `0002_orders` (matching `plan.md` §4 & §6 and `PRD.md` §6–7):
1. **`products`:** `id`, `sku` (unique), `title`, `description`, `price NUMERIC(12,2) CHECK (price >= 0)`, `availability` (`AVAILABLE`, `HIDDEN`, `OUT_OF_STOCK`), plus metadata columns if needed for editorial display (`category`, `finish`, `dimensions_cm`, `dimensions_in`, `badge`)—**no stock counts (`D-08`)**.
2. **`orders`:**
   - `id`, `order_number` (from DB sequence e.g. `OF-000001`, set once), `public_token` (128-bit random hex, set once), `source` (`STOREFRONT` | `MANUAL`), `customer_user_id` (nullable FK to `users`, set once), `external_reference` (nullable).
   - `lifecycle_status` (`PENDING_PAYMENT`, `PAID`, `PREPARING`, `DISPATCHED`, `DELIVERED`, `CANCELLED`), `order_version` (integer default 1), `has_pending_address_request` (boolean default false), `checklist_epoch` (integer default 0).
   - `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by` (all nullable, set-once triggers).
   - Money columns (`NUMERIC(12,2) CHECK (>= 0)`): `subtotal_pkr`, `delivery_charge_pkr`, `total_pkr`.
   - Recipient fields: `recipient_name`, `recipient_phone`, `recipient_email`, `delivery_address`, `order_note` (nullable).
3. **`order_items`:** snapshot lines (`id`, `order_id`, `product_id`, `product_title`, `product_sku`, `quantity CHECK (quantity BETWEEN 1 AND 20)`, `unit_price NUMERIC(12,2)`, `line_total NUMERIC(12,2)`).
4. **`checklist_steps`:** 5 rows created per order (`step_number` 1..5, unique `(order_id, step_number)`, `is_completed`, `completed_by`, `completed_at`).
5. **`idempotency_keys`:** `(actor_id, request_id)` unique, `endpoint`, `payload_hash`, `response_status`, `response_body`, `created_at`.
6. **Database Triggers & CHECK Constraints (`PRD.md` §6–7):**
   - Set-once triggers on `payment_verified_at`, `dispatched_at`, `delivered_at`, `delivered_by`, `order_number`, `public_token`, `customer_user_id`.
   - Full lifecycle-graph trigger (`PENDING_PAYMENT -> PAID -> PREPARING -> DISPATCHED -> DELIVERED`, `PREPARING -> PAID`, and pre-dispatch `-> CANCELLED`).
   - Timestamp CHECKs: `PAID`/`PREPARING`/`DISPATCHED`/`DELIVERED` require `payment_verified_at IS NOT NULL`; `DISPATCHED`/`DELIVERED` require `dispatched_at IS NOT NULL`; `DELIVERED` requires `delivered_at IS NOT NULL`.
   - Grant appropriate privileges to `orderflow_app` (no `DELETE` or `TRUNCATE`).

### B. Seed Data (`Ghar ki Ronak` Decor Catalogue)
Seed 8 curated **Ghar ki Ronak** items with `availability = 'AVAILABLE'` (plus 1 `OUT_OF_STOCK` or test fixture as needed for Scenario 47):
1. `GKR-MIR-001` — **Wavy Full-Length Golden Arch Mirror** (`Mirrors`, `14500.00`, `Hand-Burnished Antique Brass`, `165 × 65 × 4 cm`)
2. `GKR-MIR-002` — **Arched Brass Vanity Table Mirror** (`Mirrors`, `5800.00`, `Brushed Champagne Gold`, `42 × 28 × 12 cm`)
3. `GKR-LMP-001` — **Pleated Linen & Ceramic Table Lamp** (`Lamps`, `6200.00`, `Raw Oatmeal Ceramic & Warm Linen`, `46 × 30 × 30 cm`)
4. `GKR-LMP-002` — **Sculptural Rattan & Brass Floor Lamp** (`Lamps`, `12900.00`, `Woven Cane & Matte Brass`, `152 × 38 × 38 cm`)
5. `GKR-VAS-001` — **Crushed Glass & Gold Leaf Statement Vase** (`Vases & Glass`, `4200.00`, `Champagne Crushed Crystal`, `32 × 18 × 18 cm`)
6. `GKR-VAS-002` — **Amber Fluted Borosilicate Hurricane Vase** (`Vases & Glass`, `3400.00`, `Warm Honey Amber Glass`, `26 × 15 × 15 cm`)
7. `GKR-PLT-001` — **Fiddle Leaf Fig in Textured Terracotta Pot** (`Artificial Plants`, `5500.00`, `Matte Terracotta Clay & Botanical Foliage`, `110 × 45 × 45 cm`)
8. `GKR-PLT-002` — **Trailing Olive Branch Ceramic Planter** (`Artificial Plants`, `3900.00`, `Chalk White Stoneware`, `58 × 32 × 32 cm`)

### C. Express Backend Endpoints (`apps/api` under `/api/v1`)
1. `GET /api/v1/storefront/products` (public):
   - Lists products where `availability != 'HIDDEN'`.
   - Calls `stock.isHeld(productId)` behind an interface that returns `false` in Slice 1B (`plan.md` §7).
   - Record storefront list response timing for early NFR-02 evidence (`< 1s`).
2. `POST /api/v1/orders` (requires `customer.order.create` + CSRF + per-user rate limit 10/hr):
   - Body: `{ request_id, expected_total, recipient_name, phone, email, delivery_address, note?, items: [{ product_id, quantity }] }`.
   - Phone must match `^\+?[0-9]{10,15}$`; quantity `1..20` per line, `1..30` lines.
   - Reads products `FOR SHARE`, computes server prices with `Prisma.Decimal` (delivery charge `0.00` until Slice 1D), ignores any client-sent prices.
   - Rejects `HIDDEN` / `OUT_OF_STOCK` / held products with `PRODUCT_UNAVAILABLE`.
   - Compares server total with `expected_total`; on mismatch returns HTTP `409` `PRICE_CHANGED` with current server total (`D-35`).
   - Enforces `request_id` idempotency (`201` on create, replays stored response on duplicate `request_id` with same payload, `409 IDEMPOTENCY_CONFLICT` on different payload).
   - Inserts `orders` (`source = 'STOREFRONT'`, `lifecycle_status = 'PENDING_PAYMENT'`), `order_items`, 5 `checklist_steps`, and append-only `audit_events` in one transaction.
3. `GET /api/v1/my/orders` & `GET /api/v1/my/orders/:orderNumber` (requires `customer.order.read_own`):
   - Query-level isolation (`WHERE customer_user_id = currentUser.id`); another customer's order returns `404 NOT_FOUND`.
   - Customer DTO excludes internal notes, checklist steps, audit events, payment references, and staff names (`PRD.md` §5 FR-01).

### D. Frontend Routes & Formrest-Inspired Editorial UI (`apps/web`, Plain CSS)
- Support routes `/shop` (and product detail view), `/cart`, `/checkout` (redirects unauthenticated visitors to `/sign-in` and back), `/my-orders`, and `/my-orders/:orderNumber` (`plan.md` §4).
- Implement the **Formrest — Furniture & Lifestyle** visual system using **plain CSS** (`GharKiRonakStorefront.css` + `GharKiRonakStorefront.tsx`):
  - Palette: Warm Alabaster `#FAF8F5`, Soft Linen `#F3EFEA`, Terracotta `#B4532A`, Sage `#4A5D4E`, Charcoal `#1C1917`, Hairline `#E7E2DA`.
  - Typography: `Cormorant Garamond` serif display headings + `Plus Jakarta Sans` UI/tabular `PKR` prices.
  - Features: Delicate botanical flower SVG logo mark, split hero showcase, category filter pills, `cm`/`in` dimension toggle, product quick-view modal, slide-out cart drawer + `/cart`, `/checkout` form handling `PRICE_CHANGED` & `PRODUCT_UNAVAILABLE`, and `/my-orders` + `/my-orders/:orderNumber` showing `PENDING_PAYMENT` ("Awaiting payment") status.

### E. Mandatory Slice 1B Scenarios (`plan.md` §4 & §5.3)
- **Scenario 1:** Signed-in customer order server-priced; client price tampering ignored; anonymous `POST /api/v1/orders` returns `401`.
- **Scenario 2:** Duplicate `request_id` creates one order.
- **Scenario 17:** Lifecycle graph enforced by DB trigger (SQL test).
- **Scenario 31:** Customer A cannot read Customer B's order list or detail (`404`); customer calling staff endpoints gets `403`.
- **Scenario 37:** Customer cannot edit delivery address after order submission.
- **Scenario 47:** Price change between cart and submit returns `409 PRICE_CHANGED` with new total and creates no order.
- **Scenario 65:** DB CHECKs refuse `PAID`+ without `payment_verified_at`, `DISPATCHED`+ without `dispatched_at`, and `DELIVERED` without `delivered_at` (SQL test).

---

## 3. Formrest-Inspired Storefront UI Reference Component (`GharKiRonakStorefront.tsx`)

*(Note: Keep styling in a companion plain CSS file `GharKiRonakStorefront.css` per `PRD.md` §13 — no Tailwind classes required.)*

```tsx
import React, { useMemo, useState } from 'react';
import './GharKiRonakStorefront.css';

export interface StorefrontProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  price: string; // Decimal string e.g. "14500.00"
  availability: 'AVAILABLE' | 'HIDDEN' | 'OUT_OF_STOCK';
  isHeld?: boolean;
  category?: string;
  finish?: string;
  dimensionsCm?: string;
  dimensionsIn?: string;
  badge?: string;
}

export interface CustomerOrderItem {
  productId: string;
  productTitle: string;
  productSku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  lifecycleStatus: string;
  createdAt: string;
  subtotalPkr: string;
  deliveryChargePkr: string;
  totalPkr: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  trackingNumber?: string | null;
  items: CustomerOrderItem[];
}

export interface CheckoutSubmission {
  request_id: string;
  expected_total: string;
  recipient_name: string;
  phone: string;
  email: string;
  delivery_address: string;
  note?: string;
  items: Array<{ product_id: string; quantity: number }>;
}

interface Props {
  products: StorefrontProduct[];
  orders: CustomerOrder[];
  currentUser: { id: string; name: string; email: string; roles: string[] } | null;
  deliveryChargePkr?: string;
  onSubmitOrder: (payload: CheckoutSubmission) => Promise<CustomerOrder>;
  onRefreshProducts: () => Promise<void>;
  onSignOut?: () => void;
}

function formatPkr(decimalStr: string): string {
  const num = Number(decimalStr || '0');
  return `PKR ${num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const FlowerLogoMark: React.FC = () => (
  <svg viewBox="0 0 36 36" width="28" height="28" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="2.6" fill="#B4532A" />
    <path d="M18 5.5C20.4 9.2 20.4 13.1 18 15.2C15.6 13.1 15.6 9.2 18 5.5Z" stroke="#B4532A" strokeWidth="1.4" />
    <path d="M18 30.5C20.4 26.8 20.4 22.9 18 20.8C15.6 22.9 15.6 26.8 18 30.5Z" stroke="#B4532A" strokeWidth="1.4" />
    <path d="M5.5 18C9.2 15.6 13.1 15.6 15.2 18C13.1 20.4 9.2 20.4 5.5 18Z" stroke="#B4532A" strokeWidth="1.4" />
    <path d="M30.5 18C26.8 15.6 22.9 15.6 20.8 18C22.9 20.4 26.8 20.4 30.5 18Z" stroke="#B4532A" strokeWidth="1.4" />
    <path d="M9.2 9.2C13.1 10.1 15.5 12.5 16 15.8C12.7 15.3 10.3 12.9 9.2 9.2Z" stroke="#4A5D4E" strokeWidth="1.2" />
    <path d="M26.8 9.2C22.9 10.1 20.5 12.5 20 15.8C23.3 15.3 25.7 12.9 26.8 9.2Z" stroke="#4A5D4E" strokeWidth="1.2" />
    <path d="M9.2 26.8C13.1 25.9 15.5 23.5 16 20.2C12.7 20.7 10.3 23.1 9.2 26.8Z" stroke="#4A5D4E" strokeWidth="1.2" />
    <path d="M26.8 26.8C22.9 25.9 20.5 23.5 20 20.2C23.3 20.7 25.7 23.1 26.8 26.8Z" stroke="#4A5D4E" strokeWidth="1.2" />
  </svg>
);

export const GharKiRonakStorefront: React.FC<Props> = ({
  products,
  orders,
  currentUser,
  deliveryChargePkr = '0.00',
  onSubmitOrder,
  onRefreshProducts,
  onSignOut,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All Pieces');
  const [searchQuery, setSearchQuery] = useState('');
  const [dimensionUnit, setDimensionUnit] = useState<'cm' | 'in'>('cm');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isBagOpen, setIsBagOpen] = useState(false);

  const [recipientName, setRecipientName] = useState(currentUser?.name ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [priceChangedNotice, setPriceChangedNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCustomer = Boolean(currentUser?.roles.includes('customer'));

  const categories = useMemo(() => {
    const set = new Set<string>(['All Pieces']);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (p.availability === 'HIDDEN') return false;
      const catOk = selectedCategory === 'All Pieces' || p.category === selectedCategory;
      const qOk = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [products, selectedCategory, searchQuery]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((p) => p.id === id);
        if (!product || qty <= 0) return null;
        return { product, quantity: qty };
      })
      .filter((x): x is { product: StorefrontProduct; quantity: number } => x !== null);
  }, [cart, products]);

  const subtotalCents = useMemo(
    () =>
      cartLines.reduce(
        (sum, line) => sum + Math.round(Number(line.product.price) * 100) * line.quantity,
        0
      ),
    [cartLines]
  );

  const deliveryCents = Math.round(Number(deliveryChargePkr) * 100);
  const expectedTotalStr = ((subtotalCents + deliveryCents) / 100).toFixed(2);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setPriceChangedNotice(null);

    if (!isCustomer) {
      window.location.assign('/sign-in?redirect=/checkout');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmitOrder({
        request_id: crypto.randomUUID(),
        expected_total: expectedTotalStr,
        recipient_name: recipientName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        delivery_address: deliveryAddress.trim(),
        note: note.trim() || undefined,
        items: cartLines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      });
      setCart({});
      setIsBagOpen(false);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; current_total?: string };
      if (apiErr?.code === 'PRICE_CHANGED') {
        await onRefreshProducts();
        setPriceChangedNotice(
          `Catalogue prices were updated (new total: ${formatPkr(apiErr.current_total ?? expectedTotalStr)}). Review and submit again.`
        );
      } else {
        setCheckoutError(apiErr?.message ?? 'Unable to place order.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gkr-shell">
      <header className="gkr-header">
        <div className="gkr-container gkr-header-inner">
          <a href="/shop" className="gkr-brand">
            <FlowerLogoMark/>
            <span className="gkr-wordmark">Ghar ki Ronak</span>
          </a>

          <nav className="gkr-nav" aria-label="Storefront navigation">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={selectedCategory === cat ? 'gkr-nav-link is-active' : 'gkr-nav-link'}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
            {isCustomer && (
              <a href="/my-orders" className="gkr-nav-link">
                My Orders ({orders.length})
              </a>
            )}
          </nav>

          <div className="gkr-actions">
            {currentUser ? (
              <>
                <span className="gkr-user-pill">{currentUser.name}</span>
                {onSignOut && (
                  <button type="button" className="gkr-text-btn" onClick={onSignOut}>
                    Sign out
                  </button>
                )}
              </>
            ) : (
              <a href="/sign-in?redirect=/shop" className="gkr-outline-btn">
                Sign in
              </a>
            )}
            <button
              type="button"
              className="gkr-bag-btn"
              onClick={() => setIsBagOpen(true)}
            >
              Bag ({cartLines.reduce((s, l) => s + l.quantity, 0)})
            </button>
          </div>
        </div>
      </header>

      <section className="gkr-hero">
        <div className="gkr-container gkr-hero-grid">
          <div>
            <p className="gkr-eyebrow">CURATED HOME DECOR • PAKISTAN</p>
            <h1 className="gkr-hero-title">Warmth, Light &amp; Quiet Form for Everyday Living.</h1>
            <p className="gkr-hero-subtitle">
              Handcrafted arch mirrors, warm linen lighting, crushed glass vessels, and lifelike botanical planters.
            </p>
          </div>
        </div>
      </section>

      <main className="gkr-container gkr-catalog">
        <div className="gkr-toolbar">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decor pieces..."
            aria-label="Search products"
            className="gkr-search"
          />
          <div className="gkr-unit-toggle" role="group" aria-label="Dimension unit">
            <button
              type="button"
              className={dimensionUnit === 'cm' ? 'is-active' : ''}
              onClick={() => setDimensionUnit('cm')}
            >
              cm
            </button>
            <button
              type="button"
              className={dimensionUnit === 'in' ? 'is-active' : ''}
              onClick={() => setDimensionUnit('in')}
            >
              in
            </button>
          </div>
        </div>

        <div className="gkr-grid">
          {visibleProducts.map((product) => {
            const unavailable = product.availability !== 'AVAILABLE' || Boolean(product.isHeld);
            const badgeText = product.isHeld
              ? 'Checking availability, temporarily unavailable'
              : product.availability === 'OUT_OF_STOCK'
                ? 'Out of stock'
                : product.badge;

            return (
              <article key={product.id} className="gkr-card">
                <div className="gkr-card-media">
                  {badgeText && <span className="gkr-badge">{badgeText}</span>}
                  <button
                    type="button"
                    className="gkr-add-btn"
                    disabled={unavailable}
                    onClick={() => {
                      setCart((prev) => ({
                        ...prev,
                        [product.id]: Math.min(20, (prev[product.id] ?? 0) + 1),
                      }));
                      setIsBagOpen(true);
                    }}
                  >
                    {unavailable ? 'Unavailable' : '+ Add to Bag'}
                  </button>
                </div>
                <p className="gkr-card-meta">
                  {product.category ?? 'Decor'} •{' '}
                  {dimensionUnit === 'cm' ? product.dimensionsCm : product.dimensionsIn}
                </p>
                <h2 className="gkr-card-title">{product.title}</h2>
                <p className="gkr-card-price">{formatPkr(product.price)}</p>
              </article>
            );
          })}
        </div>
      </main>

      {isBagOpen && (
        <aside className="gkr-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Cart and Checkout">
          <div className="gkr-drawer">
            <div className="gkr-drawer-header">
              <h2>Your Bag</h2>
              <button type="button" onClick={() => setIsBagOpen(false)}>
                Close
              </button>
            </div>

            {cartLines.length === 0 ? (
              <p className="gkr-empty">Your bag is empty.</p>
            ) : (
              <form onSubmit={handlePlaceOrder} className="gkr-checkout-form">
                <ul className="gkr-cart-list">
                  {cartLines.map(({ product, quantity }) => (
                    <li key={product.id} className="gkr-cart-row">
                      <div>
                        <strong>{product.title}</strong>
                        <span>{formatPkr(product.price)} × {quantity}</span>
                      </div>
                      <div className="gkr-qty-controls">
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => {
                              const next = { ...prev };
                              if (quantity <= 1) delete next[product.id];
                              else next[product.id] = quantity - 1;
                              return next;
                            })
                          }
                        >
                          −
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => ({
                              ...prev,
                              [product.id]: Math.min(20, quantity + 1),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {priceChangedNotice && <p className="gkr-alert-warn">{priceChangedNotice}</p>}
                {checkoutError && <p className="gkr-alert-error">{checkoutError}</p>}

                <label>
                  Recipient Name
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </label>

                <label>
                  Phone (+923001234567 or 03001234567)
                  <input
                    type="tel"
                    required
                    pattern="^\+?[0-9]{10,15}$"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label>
                  Delivery Address (editable until submission)
                  <textarea
                    required
                    minLength={8}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                  />
                </label>

                <label>
                  Note (Optional)
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>

                <div className="gkr-total-row">
                  <span>Expected Total</span>
                  <strong>{formatPkr(expectedTotalStr)}</strong>
                </div>

                <button type="submit" disabled={submitting} className="gkr-submit-btn">
                  {!isCustomer
                    ? 'Sign in to Checkout'
                    : submitting
                      ? 'Placing Order...'
                      : `Place Order (${formatPkr(expectedTotalStr)})`}
                </button>
              </form>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
```