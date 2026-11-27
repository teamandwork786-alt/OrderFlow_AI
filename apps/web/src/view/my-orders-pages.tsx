import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CustomerOrder } from "@orderflow/shared";
import { usePageTitle } from "../controller/page.js";
import { useMyOrder, useMyOrders } from "../controller/storefront.js";
import { formatPkr, parseMoney } from "../model/money.js";
import { StorefrontShell } from "./storefront-shell.js";

const STATUS_LABEL: Record<CustomerOrder["lifecycle_status"], string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Payment received",
  PREPARING: "Being prepared",
  DISPATCHED: "On its way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};

/** Text plus colour, never colour alone. */
function StatusBadge({
  status
}: {
  status: CustomerOrder["lifecycle_status"];
}) {
  const tone =
    status === "CANCELLED"
      ? "sf-badge-warn"
      : status === "PENDING_PAYMENT"
        ? "sf-badge-wait"
        : "sf-badge-ok";
  return <span className={`sf-badge ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function when(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function MyOrdersPage() {
  usePageTitle("My orders · Ghar ki Ronak");
  const [page, setPage] = useState(1);
  const orders = useMyOrders(page);
  const pages = orders.data
    ? Math.max(1, Math.ceil(orders.data.total / orders.data.page_size))
    : 1;
  return (
    <StorefrontShell>
      <main className="sf-wrap sf-narrow">
        <h1 className="sf-page-title">My orders</h1>
        {orders.isPending && (
          <p className="sf-muted" role="status">
            Loading your orders…
          </p>
        )}
        {orders.isError && (
          <p className="form-error" role="alert">
            Your orders could not be loaded. Refresh to try again.
          </p>
        )}
        {orders.data && orders.data.items.length === 0 && (
          <section className="sf-empty">
            <p>You have not placed an order yet.</p>
            <Link className="sf-button" to="/shop">
              Start shopping
            </Link>
          </section>
        )}
        <div className="sf-order-list">
          {orders.data?.items.map((order) => (
            <article key={order.order_number} className="sf-order-row">
              <div>
                <Link to={`/my-orders/${order.order_number}`}>
                  {order.order_number}
                </Link>
                <p className="sf-muted">{when(order.created_at)}</p>
              </div>
              <StatusBadge status={order.lifecycle_status} />
              <strong>{formatPkr(parseMoney(order.total_pkr))}</strong>
            </article>
          ))}
        </div>
        {pages > 1 && (
          <p className="sf-pager">
            <button
              type="button"
              className="sf-link-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="sf-link-button"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </p>
        )}
      </main>
    </StorefrontShell>
  );
}

export function OrderDetailPage() {
  const { orderNumber = "" } = useParams();
  usePageTitle(`Order ${orderNumber} · Ghar ki Ronak`);
  const order = useMyOrder(orderNumber);

  if (order.isError && (order.error as { status?: number }).status === 404) {
    return (
      <StorefrontShell>
        <main className="sf-wrap sf-narrow sf-empty">
          <h1 className="sf-page-title">Order not found</h1>
          <p>We could not find that order in your account.</p>
          <Link className="sf-button" to="/my-orders">
            Back to my orders
          </Link>
        </main>
      </StorefrontShell>
    );
  }
  return (
    <StorefrontShell>
      <main className="sf-wrap sf-narrow">
        {order.isPending && (
          <p className="sf-muted" role="status">
            Loading your order…
          </p>
        )}
        {order.isError && (
          <p className="form-error" role="alert">
            This order could not be loaded. Refresh to try again.
          </p>
        )}
        {order.data && <OrderBody order={order.data} />}
      </main>
    </StorefrontShell>
  );
}

function OrderBody({ order }: { order: CustomerOrder }) {
  return (
    <>
      <h1 className="sf-page-title">Order {order.order_number}</h1>
      <p>
        <StatusBadge status={order.lifecycle_status} />{" "}
        <span className="sf-muted">Placed {when(order.created_at)}</span>
      </p>
      {order.lifecycle_status === "PENDING_PAYMENT" && (
        <p className="sf-muted">
          Your order is saved. Payment is not confirmed yet.
        </p>
      )}
      <ul className="sf-lines">
        {order.items.map((item) => (
          <li key={item.product_sku} className="sf-line">
            <div className="sf-line-body">
              <p className="sf-line-title">{item.product_title}</p>
              <p className="sf-muted">
                {item.quantity} × {formatPkr(parseMoney(item.unit_price))}
              </p>
            </div>
            <p className="sf-line-total">
              {formatPkr(parseMoney(item.line_total))}
            </p>
          </li>
        ))}
      </ul>
      <dl className="sf-totals">
        <dt>Subtotal</dt>
        <dd>{formatPkr(parseMoney(order.subtotal_pkr))}</dd>
        <dt>Delivery</dt>
        <dd>{formatPkr(parseMoney(order.delivery_charge_pkr))}</dd>
        <dt>Total</dt>
        <dd>
          <strong>{formatPkr(parseMoney(order.total_pkr))}</strong>
        </dd>
      </dl>
      <section className="sf-address">
        <h2>Delivering to</h2>
        <p>{order.recipient_name}</p>
        <p>{order.recipient_phone}</p>
        <p>{order.delivery_address}</p>
        {order.note && <p className="sf-muted">Note: {order.note}</p>}
      </section>
      <Link className="sf-button sf-button-outline" to="/my-orders">
        Back to my orders
      </Link>
    </>
  );
}
