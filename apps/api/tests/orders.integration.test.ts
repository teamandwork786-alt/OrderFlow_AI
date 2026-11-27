import { randomUUID } from "node:crypto";
import request from "supertest";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CustomerOrderSchema,
  StorefrontProductListSchema
} from "@orderflow/shared";
import {
  createSessionForRole,
  createSessionForUser,
  createTestApp,
  requireDatabaseUrl,
  type TestSession
} from "./support/runtime.js";

type App = Awaited<ReturnType<typeof createTestApp>>;

const owner = new Pool({
  connectionString: requireDatabaseUrl("IDENTITY_TEST_DATABASE_OWNER_URL")
});

interface Fixture {
  id: string;
  sku: string;
  price: string;
}

async function createProduct(
  price: string,
  availability = "AVAILABLE"
): Promise<Fixture> {
  const sku = `T-${randomUUID().slice(0, 8)}`;
  const result = await owner.query<{ id: string }>(
    `INSERT INTO products (sku, title, description, category, finish,
       dimensions_cm, dimensions_in, price_pkr, availability)
     VALUES ($1, $2, 'Test piece', 'Wall Art', 'Matte', '30 x 30', '11.8 x 11.8', $3, $4)
     RETURNING id`,
    [sku, `Test ${sku}`, price, availability]
  );
  return { id: result.rows[0]?.id ?? "", sku, price };
}

async function createCustomer(): Promise<TestSession & { userId: string }> {
  const { prisma } = await import("../src/db/prisma.js");
  const unique = randomUUID();
  const user = await prisma.user.create({
    data: {
      oidcSubject: `slice-1b-${unique}`,
      name: "Slice 1B customer",
      email: `slice-1b-${unique}@example.test`,
      userRoles: { create: { roleId: "customer" } }
    },
    select: { id: true }
  });
  return { userId: user.id, ...(await createSessionForUser(user.id)) };
}

function orderBody(
  items: Array<{ product_id: string; quantity: number }>,
  expectedTotal: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    request_id: randomUUID(),
    expected_total: expectedTotal,
    recipient_name: "Amna Khan",
    phone: "+923001234567",
    email: "amna@example.test",
    delivery_address: "House 12, Street 4, Gulberg, Lahore",
    note: "Ring the bell",
    items,
    ...overrides
  };
}

function post(app: App, session: TestSession | null, body: unknown) {
  const call = request(app).post("/api/v1/orders");
  if (session) {
    call.set("Cookie", session.cookie).set("X-CSRF-Token", session.csrfToken);
  }
  return call.send(body as object);
}

async function countOrders(customerId: string): Promise<number> {
  const result = await owner.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM orders WHERE customer_user_id = $1`,
    [customerId]
  );
  return Number(result.rows[0]?.count);
}

describe("Slice 1B customer places an order", () => {
  let app: App;
  let product: Fixture;
  let second: Fixture;

  beforeAll(async () => {
    app = await createTestApp();
    product = await createProduct("1500.50");
    second = await createProduct("250.00");
  });
  afterAll(async () => {
    await owner.end();
  });

  it("1B-A01 lists products publicly without hidden ones", async () => {
    const hidden = await createProduct("99.00", "HIDDEN");
    const out = await createProduct("99.00", "OUT_OF_STOCK");
    const response = await request(app).get("/api/v1/storefront/products");
    expect(response.status).toBe(200);
    const parsed = StorefrontProductListSchema.parse(response.body);
    const ids = parsed.items.map((item) => item.id);
    expect(ids).toContain(product.id);
    expect(ids).toContain(out.id);
    expect(ids).not.toContain(hidden.id);
    const listed = parsed.items.find((item) => item.id === product.id);
    expect(listed).toMatchObject({ price: "1500.50", is_held: false });
  });

  it("1B-A02 creates an order from server prices with a checklist and audit event", async () => {
    const customer = await createCustomer();
    const body = orderBody(
      [
        { product_id: product.id, quantity: 2 },
        { product_id: second.id, quantity: 1 }
      ],
      "3251.00"
    );
    const response = await post(app, customer, body);
    expect(response.status).toBe(201);
    const order = CustomerOrderSchema.parse(response.body);
    expect(order).toMatchObject({
      lifecycle_status: "PENDING_PAYMENT",
      subtotal_pkr: "3251.00",
      delivery_charge_pkr: "0.00",
      total_pkr: "3251.00"
    });
    expect(order.items).toHaveLength(2);
    const stored = await owner.query<{ id: string; public_token: string }>(
      `SELECT id, public_token FROM orders WHERE order_number = $1`,
      [order.order_number]
    );
    const steps = await owner.query(
      `SELECT step_number FROM checklist_steps WHERE order_id = $1 ORDER BY step_number`,
      [stored.rows[0]?.id]
    );
    expect(steps.rows.map((row) => row.step_number)).toEqual([1, 2, 3, 4, 5]);
    const audit = await owner.query<{ details: Record<string, unknown> }>(
      `SELECT details FROM audit_events WHERE event_type = 'ORDER_CREATED' AND actor_id = $1`,
      [customer.userId]
    );
    expect(audit.rows).toHaveLength(1);
    expect(Object.keys(audit.rows[0]?.details ?? {}).sort()).toEqual([
      "line_count",
      "order_id",
      "order_number",
      "source"
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain("Gulberg");
    // The public token is never in the customer response.
    expect(JSON.stringify(response.body)).not.toContain(
      stored.rows[0]?.public_token ?? "missing"
    );
  });

  it("1B-A03 rejects anonymous creation with 401", async () => {
    const response = await post(app, null, orderBody([], "0.00"));
    expect(response.status).toBe(401);
  });

  it("1B-A04 requires a valid CSRF token", async () => {
    const customer = await createCustomer();
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Cookie", customer.cookie)
      .set("X-CSRF-Token", "wrong")
      .send(orderBody([{ product_id: product.id, quantity: 1 }], "1500.50"));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_INVALID");
    expect(await countOrders(customer.userId)).toBe(0);
  });

  it("1B-A05 ignores client-supplied prices and totals (Scenario 2)", async () => {
    const customer = await createCustomer();
    const body = orderBody(
      [{ product_id: product.id, quantity: 1 }],
      "1500.50",
      {
        total_pkr: "1.00",
        subtotal_pkr: "1.00",
        unit_price: "1.00",
        items: [{ product_id: product.id, quantity: 1, unit_price: "1.00" }]
      }
    );
    const response = await post(app, customer, body);
    expect(response.status).toBe(201);
    expect(response.body.total_pkr).toBe("1500.50");
    expect(response.body.items[0].unit_price).toBe("1500.50");
  });

  it("1B-A06 returns PRICE_CHANGED with the current total and creates nothing", async () => {
    const customer = await createCustomer();
    const response = await post(
      app,
      customer,
      orderBody([{ product_id: product.id, quantity: 1 }], "1400.00")
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PRICE_CHANGED");
    expect(response.body.error.current_total).toBe("1500.50");
    expect(await countOrders(customer.userId)).toBe(0);
  });

  it("1B-A07 compares expected_total as a decimal, not text", async () => {
    const customer = await createCustomer();
    const response = await post(
      app,
      customer,
      orderBody([{ product_id: product.id, quantity: 1 }], "1500.5")
    );
    expect(response.status).toBe(201);
  });

  it("1B-A08 refuses hidden, out-of-stock and unknown products", async () => {
    const customer = await createCustomer();
    const hidden = await createProduct("10.00", "HIDDEN");
    const out = await createProduct("10.00", "OUT_OF_STOCK");
    const unknown = randomUUID();
    const response = await post(
      app,
      customer,
      orderBody(
        [
          { product_id: hidden.id, quantity: 1 },
          { product_id: out.id, quantity: 1 },
          { product_id: unknown, quantity: 1 }
        ],
        "30.00"
      )
    );
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect([...response.body.error.product_ids].sort()).toEqual(
      [hidden.id, out.id, unknown].sort()
    );
    expect(await countOrders(customer.userId)).toBe(0);
  });

  it("1B-A09 validates the body with 400 and creates nothing", async () => {
    const line = [{ product_id: product.id, quantity: 1 }];
    const bad: Array<Record<string, unknown>> = [
      { phone: "abc" },
      { phone: "123" },
      { email: "not-an-email" },
      { recipient_name: "   " },
      { delivery_address: "short" },
      { delivery_address: "x".repeat(501) },
      { note: "n".repeat(501) },
      { expected_total: "12.345" },
      { expected_total: "-5.00" },
      { request_id: "nope" },
      { items: [] },
      { items: [{ product_id: product.id, quantity: 0 }] },
      { items: [{ product_id: product.id, quantity: 21 }] },
      { items: [...line, ...line] }
    ];
    for (const override of bad) {
      // A fresh customer per case: failed attempts also count toward the limit.
      const customer = await createCustomer();
      const response = await post(
        app,
        customer,
        orderBody(line, "1500.50", override)
      );
      expect(response.status, JSON.stringify(override)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(await countOrders(customer.userId)).toBe(0);
    }
  });

  it("1B-A10 accepts the boundary values", async () => {
    const customer = await createCustomer();
    const response = await post(
      app,
      customer,
      orderBody([{ product_id: second.id, quantity: 20 }], "5000.00", {
        phone: "03001234567",
        delivery_address: "12345678",
        recipient_name: "A".repeat(200),
        note: "n".repeat(500)
      })
    );
    expect(response.status).toBe(201);
  });

  it("1B-A11 replays an identical request_id and returns one order", async () => {
    const customer = await createCustomer();
    const body = orderBody(
      [{ product_id: product.id, quantity: 1 }],
      "1500.50"
    );
    const first = await post(app, customer, body);
    const again = await post(app, customer, body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body.order_number).toBe(first.body.order_number);
    expect(await countOrders(customer.userId)).toBe(1);
  });

  it("1B-A12 returns 409 when a request_id is reused with a different payload", async () => {
    const customer = await createCustomer();
    const body = orderBody(
      [{ product_id: product.id, quantity: 1 }],
      "1500.50"
    );
    await post(app, customer, body);
    const response = await post(app, customer, {
      ...body,
      expected_total: "3001.00",
      items: [{ product_id: product.id, quantity: 2 }]
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await countOrders(customer.userId)).toBe(1);
  });

  it("1B-A13 creates one order for concurrent duplicates", async () => {
    const customer = await createCustomer();
    const body = orderBody(
      [{ product_id: product.id, quantity: 1 }],
      "1500.50"
    );
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(app, customer, body))
    );
    for (const response of responses) expect(response.status).toBe(201);
    expect(new Set(responses.map((r) => r.body.order_number)).size).toBe(1);
    expect(await countOrders(customer.userId)).toBe(1);
  });

  it("1B-A14 stores no PII in the idempotency key", async () => {
    const customer = await createCustomer();
    const response = await post(
      app,
      customer,
      orderBody([{ product_id: product.id, quantity: 1 }], "1500.50")
    );
    const stored = await owner.query<{
      response_body: Record<string, unknown>;
    }>(`SELECT response_body FROM idempotency_keys WHERE actor_id = $1`, [
      customer.userId
    ]);
    expect(stored.rows).toHaveLength(1);
    expect(Object.keys(stored.rows[0]?.response_body ?? {}).sort()).toEqual([
      "order_id",
      "order_number"
    ]);
    expect(response.status).toBe(201);
  });

  it("1B-A15 does not store failed attempts, so a retry can succeed", async () => {
    const customer = await createCustomer();
    const body = orderBody([{ product_id: product.id, quantity: 1 }], "1.00");
    expect((await post(app, customer, body)).status).toBe(409);
    const fixed = await post(app, customer, {
      ...body,
      expected_total: "1500.50"
    });
    expect(fixed.status).toBe(201);
  });

  it("1B-A16 rate limits creation per user", async () => {
    const customer = await createCustomer();
    const other = await createCustomer();
    const line = [{ product_id: second.id, quantity: 1 }];
    for (let index = 0; index < 10; index += 1) {
      const response = await post(app, customer, orderBody(line, "250.00"));
      expect(response.status).toBe(201);
    }
    const limited = await post(app, customer, orderBody(line, "250.00"));
    expect(limited.status).toBe(429);
    const unaffected = await post(app, other, orderBody(line, "250.00"));
    expect(unaffected.status).toBe(201);
  });

  it("1B-A17 lists only the signed-in customer's own orders (Scenario 17)", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const line = [{ product_id: second.id, quantity: 1 }];
    const a = await post(app, mine, orderBody(line, "250.00"));
    const b = await post(app, theirs, orderBody(line, "250.00"));
    const response = await request(app)
      .get("/api/v1/my/orders")
      .set("Cookie", mine.cookie);
    expect(response.status).toBe(200);
    const numbers = response.body.items.map(
      (item: { order_number: string }) => item.order_number
    );
    expect(numbers).toEqual([a.body.order_number]);
    expect(numbers).not.toContain(b.body.order_number);
    expect(response.body.total).toBe(1);
  });

  it("1B-A18 returns 404 for a foreign or unknown order number, identically", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const foreign = await post(
      app,
      theirs,
      orderBody([{ product_id: second.id, quantity: 1 }], "250.00")
    );
    const foreignResponse = await request(app)
      .get(`/api/v1/my/orders/${foreign.body.order_number}`)
      .set("Cookie", mine.cookie);
    const unknownResponse = await request(app)
      .get("/api/v1/my/orders/OF-999999")
      .set("Cookie", mine.cookie);
    expect(foreignResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(foreignResponse.body.error.code).toBe(
      unknownResponse.body.error.code
    );
    expect(foreignResponse.body.error.message).toBe(
      unknownResponse.body.error.message
    );
  });

  it("1B-A19 returns the customer DTO without internal fields", async () => {
    const customer = await createCustomer();
    const created = await post(
      app,
      customer,
      orderBody([{ product_id: second.id, quantity: 1 }], "250.00")
    );
    const response = await request(app)
      .get(`/api/v1/my/orders/${created.body.order_number}`)
      .set("Cookie", customer.cookie);
    expect(response.status).toBe(200);
    expect(
      Object.keys(CustomerOrderSchema.parse(response.body)).sort()
    ).toEqual(Object.keys(response.body).sort());
    const text = JSON.stringify(response.body);
    for (const forbidden of [
      "public_token",
      "customer_user_id",
      "checklist",
      "audit",
      "payment",
      "tracking"
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("1B-A20 requires a session on the customer order routes", async () => {
    expect((await request(app).get("/api/v1/my/orders")).status).toBe(401);
    expect((await request(app).get("/api/v1/my/orders/OF-000001")).status).toBe(
      401
    );
  });

  it("1B-A21 denies staff roles the customer routes and order creation (Scenarios 31, 13)", async () => {
    const staff = await createSessionForRole("staff_full");
    const create = await post(
      app,
      staff,
      orderBody([{ product_id: second.id, quantity: 1 }], "250.00")
    );
    expect(create.status).toBe(403);
    const list = await request(app)
      .get("/api/v1/my/orders")
      .set("Cookie", staff.cookie);
    expect(list.status).toBe(403);
  });

  it("1B-A22 denies a customer a staff permission (Scenario 31)", async () => {
    const customer = await createCustomer();
    const response = await request(app)
      .get("/api/v1/test/permissions/orders.read")
      .set("Cookie", customer.cookie);
    expect(response.status).toBe(403);
  });

  it("1B-A23 offers no customer edit after submission (Scenario 37)", async () => {
    const customer = await createCustomer();
    const created = await post(
      app,
      customer,
      orderBody([{ product_id: second.id, quantity: 1 }], "250.00")
    );
    const url = `/api/v1/my/orders/${created.body.order_number}`;
    for (const method of ["patch", "put", "delete"] as const) {
      const call = request(app)[method](url);
      const response = await call
        .set("Cookie", customer.cookie)
        .set("X-CSRF-Token", customer.csrfToken)
        .send({ delivery_address: "Somewhere else entirely" });
      expect([404, 405]).toContain(response.status);
    }
    const after = await request(app).get(url).set("Cookie", customer.cookie);
    expect(after.body.delivery_address).toBe(
      "House 12, Street 4, Gulberg, Lahore"
    );
  });

  it("1B-A24 keeps recipient data out of the logs and the idempotency hash", async () => {
    const customer = await createCustomer();
    const body = orderBody([{ product_id: second.id, quantity: 1 }], "250.00");
    await post(app, customer, body);
    const stored = await owner.query<{ payload_hash: string }>(
      `SELECT payload_hash FROM idempotency_keys WHERE actor_id = $1`,
      [customer.userId]
    );
    expect(stored.rows[0]?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.payload_hash).not.toContain("amna");
  });
});
