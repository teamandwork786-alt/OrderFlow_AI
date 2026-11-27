import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  EMPTY_FORM,
  useCheckout,
  type CheckoutForm
} from "../controller/checkout.js";
import { usePageTitle } from "../controller/page.js";
import { formatPkr } from "../model/money.js";
import { StorefrontShell } from "./storefront-shell.js";

export function CheckoutPage() {
  usePageTitle("Checkout · Ghar ki Ronak");
  const { priced, pending, problem, place } = useCheckout();
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);

  function update(field: keyof CheckoutForm) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    void place(form);
  }

  const empty = priced.lines.length === 0;
  const blocked = priced.unavailable.length > 0;

  return (
    <StorefrontShell>
      <main className="sf-wrap sf-checkout">
        <h1 className="sf-page-title">Checkout</h1>
        {empty && !priced.products.isPending ? (
          <section className="sf-empty">
            <p>Your bag is empty.</p>
            <Link className="sf-button" to="/shop">
              Continue shopping
            </Link>
          </section>
        ) : (
          <div className="sf-checkout-grid">
            <form onSubmit={submit} className="sf-form" noValidate>
              <h2>Delivery details</h2>
              <label>
                Full name
                <input
                  required
                  maxLength={200}
                  autoComplete="name"
                  value={form.recipient_name}
                  onChange={update("recipient_name")}
                />
              </label>
              <label>
                Phone
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+923001234567"
                  value={form.phone}
                  onChange={update("phone")}
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  maxLength={320}
                  autoComplete="email"
                  value={form.email}
                  onChange={update("email")}
                />
              </label>
              <label>
                Delivery address
                <textarea
                  required
                  rows={3}
                  minLength={8}
                  maxLength={500}
                  autoComplete="street-address"
                  value={form.delivery_address}
                  onChange={update("delivery_address")}
                />
              </label>
              <label>
                Order note (optional)
                <textarea
                  rows={2}
                  maxLength={500}
                  value={form.note}
                  onChange={update("note")}
                />
              </label>
              <p className="sf-muted">
                Please check your address carefully. It cannot be edited once
                the order is placed.
              </p>
              {problem && (
                <p className="form-error" role="alert">
                  {problem}
                </p>
              )}
              <button
                type="submit"
                className="sf-button sf-button-block"
                disabled={pending || empty || blocked || !priced.products.data}
              >
                {pending ? "Placing order…" : "Place order"}
              </button>
            </form>

            <aside
              className="sf-summary"
              data-testid="checkout-summary"
              aria-label="Order summary"
            >
              <h2>Order summary</h2>
              <ul className="sf-summary-lines">
                {priced.lines.map((line) => (
                  <li key={line.product.id}>
                    <span>
                      {line.product.title} × {line.quantity}
                    </span>
                    <span>{formatPkr(line.lineMinor)}</span>
                  </li>
                ))}
              </ul>
              <p className="sf-subtotal">
                <span>Total</span>{" "}
                <strong>{formatPkr(priced.subtotalMinor)}</strong>
              </p>
              <p className="sf-muted">
                Payment is arranged after your order is placed.
              </p>
            </aside>
          </div>
        )}
      </main>
    </StorefrontShell>
  );
}
