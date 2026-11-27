import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ownerUrl = process.env.IDENTITY_TEST_DATABASE_OWNER_URL;
const appUrl = process.env.IDENTITY_TEST_DATABASE_APP_URL;
const roUrl = process.env.IDENTITY_TEST_DATABASE_RO_URL;
if (!ownerUrl || !appUrl || !roUrl) {
  throw new Error(
    "IDENTITY_TEST_DATABASE_{OWNER,APP,RO}_URL must point to the isolated test database"
  );
}
const owner = new Pool({ connectionString: ownerUrl });
const app = new Pool({ connectionString: appUrl });
const readOnly = new Pool({ connectionString: roUrl });

const token = () => randomBytes(16).toString("hex");

function must<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error("Expected a value in the test data.");
  return value;
}

async function insertUser(): Promise<string> {
  const unique = randomUUID();
  const result = await owner.query<{ id: string }>(
    `INSERT INTO users (oidc_subject, name, email)
     VALUES ($1, 'SQL test customer', $2) RETURNING id`,
    [`sql-1b-${unique}`, `sql-1b-${unique}@example.test`]
  );
  return must(result.rows[0]).id;
}

interface OrderOverrides {
  source?: string;
  customer_user_id?: string | null;
  recipient_email?: string | null;
  subtotal?: string;
  delivery?: string;
  total?: string;
  public_token?: string;
}

async function insertOrder(
  pool: Pool,
  customerId: string | null,
  overrides: OrderOverrides = {}
): Promise<{ id: string; order_number: string }> {
  const source = overrides.source ?? "STOREFRONT";
  const result = await pool.query<{ id: string; order_number: string }>(
    `INSERT INTO orders (public_token, source, customer_user_id, recipient_name,
       recipient_phone, recipient_email, delivery_address, subtotal_pkr,
       delivery_charge_pkr, total_pkr)
     VALUES ($1, $2, $3, 'Recipient', '+923001234567', $4,
       '12 Test Street, Lahore', $5, $6, $7)
     RETURNING id, order_number`,
    [
      overrides.public_token ?? token(),
      source,
      "customer_user_id" in overrides ? overrides.customer_user_id : customerId,
      "recipient_email" in overrides
        ? overrides.recipient_email
        : "buyer@example.test",
      overrides.subtotal ?? "100.00",
      overrides.delivery ?? "0.00",
      overrides.total ?? "100.00"
    ]
  );
  return must(result.rows[0]);
}

async function expectRejected(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

async function newOrder(): Promise<string> {
  const customerId = await insertUser();
  return (await insertOrder(owner, customerId)).id;
}

describe("Slice 1B SQL contracts (0002_orders)", () => {
  beforeAll(async () => {
    await owner.query("SELECT 1");
  });
  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), readOnly.end()]);
  });

  it("1B-S01 ships 0002_orders and its deploy is idempotent", async () => {
    const { execFileSync } = await import("node:child_process");
    const { access } = await import("node:fs/promises");
    await expect(
      access(
        new URL(
          "../../prisma/migrations/0002_orders/migration.sql",
          import.meta.url
        )
      )
    ).resolves.toBeUndefined();
    for (let run = 0; run < 2; run += 1) {
      execFileSync("npm", ["run", "db:migrate"], {
        env: { ...process.env, DATABASE_URL_OWNER: ownerUrl },
        stdio: "pipe"
      });
    }
    const result = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations"
        WHERE migration_name = '0002_orders' AND finished_at IS NOT NULL`
    );
    expect(result.rows[0]?.count).toBe("1");
  });

  it("1B-S02 generates unique OF- order numbers and keeps them set-once", async () => {
    const customerId = await insertUser();
    const first = await insertOrder(owner, customerId);
    const second = await insertOrder(owner, customerId);
    expect(first.order_number).toMatch(/^OF-[0-9]{6,}$/);
    expect(second.order_number).not.toBe(first.order_number);
    await expectRejected(
      owner.query(
        `UPDATE orders SET order_number = 'OF-999999' WHERE id = $1`,
        [first.id]
      ),
      /set-once|immutable|cannot be changed/i
    );
  });

  it("1B-S03 enforces total = subtotal + delivery and non-negative money", async () => {
    const customerId = await insertUser();
    await expectRejected(
      insertOrder(owner, customerId, { total: "99.00" }),
      /check constraint/i
    );
    await expectRejected(
      insertOrder(owner, customerId, {
        subtotal: "-1.00",
        delivery: "0.00",
        total: "-1.00"
      }),
      /check constraint/i
    );
    await expect(
      insertOrder(owner, customerId, {
        subtotal: "100.00",
        delivery: "250.00",
        total: "350.00"
      })
    ).resolves.toBeDefined();
  });

  it("1B-S04 requires customer and email for STOREFRONT, no customer for MANUAL", async () => {
    const customerId = await insertUser();
    await expectRejected(
      insertOrder(owner, null, { customer_user_id: null }),
      /check constraint/i
    );
    await expectRejected(
      insertOrder(owner, customerId, { recipient_email: null }),
      /check constraint/i
    );
    await expectRejected(
      insertOrder(owner, customerId, { source: "MANUAL" }),
      /check constraint/i
    );
    await expect(
      insertOrder(owner, null, {
        source: "MANUAL",
        customer_user_id: null,
        recipient_email: null
      })
    ).resolves.toBeDefined();
    await expectRejected(
      insertOrder(owner, customerId, { source: "OTHER" }),
      /check constraint/i
    );
  });

  it("1B-S05 validates the public token and keeps token and customer set-once", async () => {
    const customerId = await insertUser();
    await expectRejected(
      insertOrder(owner, customerId, { public_token: "not-a-token" }),
      /check constraint/i
    );
    const fixed = token();
    await insertOrder(owner, customerId, { public_token: fixed });
    await expectRejected(
      insertOrder(owner, customerId, { public_token: fixed }),
      /unique|duplicate/i
    );
    const order = await insertOrder(owner, customerId);
    const other = await insertUser();
    await expectRejected(
      owner.query(`UPDATE orders SET public_token = $2 WHERE id = $1`, [
        order.id,
        token()
      ]),
      /set-once|immutable|cannot be changed/i
    );
    await expectRejected(
      owner.query(`UPDATE orders SET customer_user_id = $2 WHERE id = $1`, [
        order.id,
        other
      ]),
      /set-once|immutable|cannot be changed/i
    );
  });

  it("1B-S06 allows exactly the eight lifecycle transitions", async () => {
    const allowed: Array<[string, string]> = [
      ["PENDING_PAYMENT", "PAID"],
      ["PENDING_PAYMENT", "CANCELLED"],
      ["PAID", "PREPARING"],
      ["PAID", "CANCELLED"],
      ["PREPARING", "PAID"],
      ["PREPARING", "DISPATCHED"],
      ["PREPARING", "CANCELLED"],
      ["DISPATCHED", "DELIVERED"]
    ];
    const states = [
      "PENDING_PAYMENT",
      "PAID",
      "PREPARING",
      "DISPATCHED",
      "DELIVERED",
      "CANCELLED"
    ];
    const customerId = await insertUser();
    const staffId = await insertUser();
    // Timestamps are provided so only the status graph is under test.
    const setup = `lifecycle_status = $2::varchar,
      payment_verified_at = COALESCE(payment_verified_at, now() - interval '3 hours'),
      dispatched_at = COALESCE(dispatched_at,
        CASE WHEN $2::varchar IN ('DISPATCHED','DELIVERED') THEN now() - interval '2 hours' END),
      delivered_at = COALESCE(delivered_at,
        CASE WHEN $2::varchar = 'DELIVERED' THEN now() - interval '1 hour' END),
      delivered_by = COALESCE(delivered_by,
        CASE WHEN $2::varchar = 'DELIVERED' THEN $3::uuid END)`;
    for (const from of states) {
      for (const to of states) {
        // A no-op update is not a transition.
        if (from === to) continue;
        const order = await insertOrder(owner, customerId);
        if (from !== "PENDING_PAYMENT") {
          // Walk the legal path so the trigger is not bypassed to reach "from".
          const path: Record<string, string[]> = {
            PAID: ["PAID"],
            PREPARING: ["PAID", "PREPARING"],
            DISPATCHED: ["PAID", "PREPARING", "DISPATCHED"],
            DELIVERED: ["PAID", "PREPARING", "DISPATCHED", "DELIVERED"],
            CANCELLED: ["CANCELLED"]
          };
          for (const step of must(path[from])) {
            await owner.query(`UPDATE orders SET ${setup} WHERE id = $1`, [
              order.id,
              step,
              staffId
            ]);
          }
        }
        const attempt = owner.query(
          `UPDATE orders SET ${setup} WHERE id = $1`,
          [order.id, to, staffId]
        );
        if (allowed.some(([a, b]) => a === from && b === to)) {
          await expect(attempt).resolves.toBeDefined();
        } else {
          await expectRejected(attempt, /lifecycle|transition|not allowed/i);
        }
      }
    }
  });

  it("1B-S07 snapshots order items with line_total = unit_price x quantity", async () => {
    const orderId = await newOrder();
    const product = await owner.query<{ id: string }>(
      `INSERT INTO products (sku, title, description, category, finish,
         dimensions_cm, dimensions_in, price_pkr)
       VALUES ($1, 'P', 'D', 'C', 'F', '1 x 1', '0.4 x 0.4', 50.00) RETURNING id`,
      [`S-${randomUUID().slice(0, 8)}`]
    );
    const productId = must(product.rows[0]).id;
    const insertItem = (quantity: number, unit: string, line: string) =>
      owner.query(
        `INSERT INTO order_items (order_id, product_id, product_title, product_sku,
           quantity, unit_price_pkr, line_total_pkr)
         VALUES ($1, $5, 'Item', 'SKU-X', $2, $3, $4)`,
        [orderId, quantity, unit, line, productId]
      );
    await expect(insertItem(2, "50.00", "100.00")).resolves.toBeDefined();
    await expectRejected(insertItem(2, "50.00", "99.00"), /check constraint/i);
    await expectRejected(insertItem(0, "50.00", "0.00"), /check constraint/i);
    await expectRejected(insertItem(21, "1.00", "21.00"), /check constraint/i);
  });

  it("1B-S08 keeps checklist steps 1..5 unique per order with consistent completion", async () => {
    const orderId = await newOrder();
    const insertStep = (
      step: number,
      completedAt: string | null,
      flag: boolean
    ) =>
      owner.query(
        `INSERT INTO checklist_steps (order_id, step_number, is_completed, completed_at)
         VALUES ($1, $2, $3, $4)`,
        [orderId, step, flag, completedAt]
      );
    await expect(insertStep(1, null, false)).resolves.toBeDefined();
    await expectRejected(insertStep(1, null, false), /unique|duplicate/i);
    await expectRejected(insertStep(6, null, false), /check constraint/i);
    await expectRejected(insertStep(2, null, true), /check constraint/i);
    await expectRejected(
      insertStep(3, new Date().toISOString(), false),
      /check constraint/i
    );
  });

  it("1B-S09 makes (actor, request_id) unique for idempotency keys", async () => {
    const customerId = await insertUser();
    const order = await insertOrder(owner, customerId);
    const requestId = randomUUID();
    const insertKey = () =>
      owner.query(
        `INSERT INTO idempotency_keys (actor_id, request_id, payload_hash, response_status, response_body)
         VALUES ($1, $2, $3, 201, $4::jsonb)`,
        [
          customerId,
          requestId,
          "a".repeat(64),
          JSON.stringify({
            order_id: order.id,
            order_number: order.order_number
          })
        ]
      );
    await expect(insertKey()).resolves.toBeDefined();
    await expectRejected(insertKey(), /unique|duplicate/i);
  });

  it("1B-S10 gives the app role insert and share-lock rights only", async () => {
    const customerId = await insertUser();
    const order = await insertOrder(app, customerId);
    expect(order.order_number).toMatch(/^OF-/);
    await expectRejected(
      app.query(`UPDATE orders SET order_note = 'x' WHERE id = $1`, [order.id]),
      /permission denied/i
    );
    await expectRejected(
      app.query(`DELETE FROM orders WHERE id = $1`, [order.id]),
      /permission denied/i
    );
    await expectRejected(
      app.query(`TRUNCATE order_items`),
      /permission denied/i
    );
    await expectRejected(
      app.query(`UPDATE products SET price_pkr = 1`),
      /permission denied/i
    );
    await expectRejected(
      app.query(`INSERT INTO products (sku) VALUES ('x')`),
      /permission denied/i
    );
    // Required so the order flow can read products FOR SHARE.
    await expect(
      app.query(`SELECT id FROM products LIMIT 1 FOR SHARE`)
    ).resolves.toBeDefined();
    await expectRejected(
      readOnly.query(`SELECT 1 FROM orders LIMIT 1`),
      /permission denied/i
    );
  });

  it("1B-S11 keeps lifecycle timestamps consistent", async () => {
    const customerId = await insertUser();
    const staffId = await insertUser();
    const order = await insertOrder(owner, customerId);
    // Dispatch time without a payment time is impossible.
    await expectRejected(
      owner.query(`UPDATE orders SET dispatched_at = now() WHERE id = $1`, [
        order.id
      ]),
      /check constraint|lifecycle/i
    );
    await owner.query(
      `UPDATE orders SET lifecycle_status = 'PAID', payment_verified_at = now() WHERE id = $1`,
      [order.id]
    );
    await expectRejected(
      owner.query(
        `UPDATE orders SET dispatched_at = payment_verified_at - interval '1 hour' WHERE id = $1`,
        [order.id]
      ),
      /check constraint/i
    );
    await expectRejected(
      owner.query(
        `UPDATE orders SET delivered_at = now(), delivered_by = $2 WHERE id = $1`,
        [order.id, staffId]
      ),
      /check constraint/i
    );
  });
});
