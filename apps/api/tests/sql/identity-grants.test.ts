import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const ownerDatabaseUrl = process.env.IDENTITY_TEST_DATABASE_OWNER_URL;
const appDatabaseUrl = process.env.IDENTITY_TEST_DATABASE_APP_URL;
const readOnlyDatabaseUrl = process.env.IDENTITY_TEST_DATABASE_RO_URL;
const ownerPool = ownerDatabaseUrl
  ? new Pool({ connectionString: ownerDatabaseUrl })
  : undefined;
const appPool = appDatabaseUrl
  ? new Pool({ connectionString: appDatabaseUrl })
  : undefined;
const readOnlyPool = readOnlyDatabaseUrl
  ? new Pool({ connectionString: readOnlyDatabaseUrl })
  : undefined;

async function requireOwnerDatabase(): Promise<Pool> {
  if (!ownerPool) {
    throw new Error(
      "IDENTITY_TEST_DATABASE_OWNER_URL must point to an isolated database migrated with 0001_identity"
    );
  }
  return ownerPool;
}

async function requireAppDatabase(): Promise<Pool> {
  if (!appPool) {
    throw new Error(
      "IDENTITY_TEST_DATABASE_APP_URL must connect as orderflow_app to the isolated identity database"
    );
  }
  return appPool;
}

async function requireReadOnlyDatabase(): Promise<Pool> {
  if (!readOnlyPool) {
    throw new Error(
      "IDENTITY_TEST_DATABASE_RO_URL must connect as orderflow_ro to the isolated identity database"
    );
  }
  return readOnlyPool;
}

describe("Slice 1A SQL contracts", () => {
  afterAll(async () => {
    await Promise.all([ownerPool?.end(), appPool?.end(), readOnlyPool?.end()]);
  });

  it("1A-17 rejects UPDATE and DELETE on audit_events as app and owner", async () => {
    const owner = await requireOwnerDatabase();
    const app = await requireAppDatabase();
    const event = await owner.query<{ id: string }>(
      `INSERT INTO audit_events (event_type, actor_type, details, correlation_id)
       VALUES ('SQL_TEST', 'SYSTEM', '{}'::jsonb, $1)
       RETURNING id`,
      [`sql-${crypto.randomUUID()}`]
    );
    const eventId = event.rows[0]?.id;
    expect(eventId).toBeDefined();

    await expect(
      app.query(
        `INSERT INTO audit_events (event_type, actor_type, details, correlation_id)
         VALUES ('SQL_TEST', 'SYSTEM', '{}'::jsonb, $1)`,
        [`sql-app-${crypto.randomUUID()}`]
      )
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      owner.query(
        "UPDATE audit_events SET details = '{}'::jsonb WHERE id = $1",
        [eventId]
      )
    ).rejects.toThrow();
    await expect(
      owner.query("DELETE FROM audit_events WHERE id = $1", [eventId])
    ).rejects.toThrow();
    await expect(
      app.query("UPDATE audit_events SET details = '{}'::jsonb WHERE id = $1", [
        eventId
      ])
    ).rejects.toThrow();
    await expect(
      app.query("DELETE FROM audit_events WHERE id = $1", [eventId])
    ).rejects.toThrow();
  });

  it("1A-13 enforces the customer/staff exclusion trigger in both directions", async () => {
    const database = await requireOwnerDatabase();
    for (const [firstRole, secondRole] of [
      ["customer", "staff_full"],
      ["staff_full", "customer"]
    ]) {
      const user = await database.query<{ id: string }>(
        `INSERT INTO users (oidc_subject, name, email)
         VALUES ($1, 'Role test', 'role-test@example.test')
         RETURNING id`,
        [`mixed-role-${crypto.randomUUID()}`]
      );
      const userId = user.rows[0]?.id;
      expect(userId).toBeDefined();
      await database.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
        [userId, firstRole]
      );
      await expect(
        database.query(
          "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
          [userId, secondRole]
        )
      ).rejects.toThrow(/customer and staff roles cannot be combined/);
    }
  });

  it("rejects values outside the audit actor_type CHECK constraint", async () => {
    const database = await requireOwnerDatabase();
    await expect(
      database.query(
        `INSERT INTO audit_events (event_type, actor_type, details, correlation_id)
         VALUES ('SQL_TEST', 'INVALID', '{}'::jsonb, $1)`,
        [`sql-check-${crypto.randomUUID()}`]
      )
    ).rejects.toThrow();
  });

  it("1A-18 denies app DELETE/TRUNCATE and read-only access to base tables", async () => {
    const owner = await requireOwnerDatabase();
    const app = await requireAppDatabase();
    const readOnly = await requireReadOnlyDatabase();
    const createdUser = await app.query<{ id: string }>(
      `INSERT INTO users (oidc_subject, name, email)
       VALUES ($1, 'Grant test', 'grant-test@example.test')
       RETURNING id`,
      [`app-grants-${crypto.randomUUID()}`]
    );
    const userId = createdUser.rows[0]?.id;
    expect(userId).toBeDefined();
    await expect(
      app.query("SELECT id FROM users WHERE id = $1", [userId])
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      app.query("UPDATE users SET name = 'Updated grant test' WHERE id = $1", [
        userId
      ])
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      app.query("UPDATE users SET oidc_subject = 'changed' WHERE id = $1", [
        userId
      ])
    ).rejects.toThrow();

    const result = await owner.query<{
      app_delete: boolean;
      app_truncate: boolean;
      ro_select_users: boolean;
    }>(
      `SELECT bool_or(has_table_privilege('orderflow_app', format('%I.%I', table_schema, table_name), 'DELETE')) AS app_delete,
              bool_or(has_table_privilege('orderflow_app', format('%I.%I', table_schema, table_name), 'TRUNCATE')) AS app_truncate,
              bool_or(has_table_privilege('orderflow_ro', format('%I.%I', table_schema, table_name), 'SELECT')) AS ro_select_users
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );

    expect(result.rows[0]).toEqual({
      app_delete: false,
      app_truncate: false,
      ro_select_users: false
    });
    await expect(app.query("DELETE FROM users")).rejects.toThrow();
    await expect(app.query("TRUNCATE users")).rejects.toThrow();
    await expect(readOnly.query("SELECT * FROM users")).rejects.toThrow();
  });

  it("1A-19 enforces uniqueness of users.oidc_subject", async () => {
    const database = await requireOwnerDatabase();
    const subject = `duplicate-${crypto.randomUUID()}`;
    await database.query(
      "INSERT INTO users (oidc_subject, name, email) VALUES ($1, 'Test', 'test@example.test')",
      [subject]
    );
    await expect(
      database.query(
        "INSERT INTO users (oidc_subject, name, email) VALUES ($1, 'Test 2', 'test2@example.test')",
        [subject]
      )
    ).rejects.toThrow();
  });

  it("1A-20 creates the identity migration and makes its deploy idempotent", async () => {
    const { execFileSync } = await import("node:child_process");
    const { access } = await import("node:fs/promises");
    const migration = new URL(
      "../../prisma/migrations/0001_identity/migration.sql",
      import.meta.url
    );
    await expect(access(migration)).resolves.toBeUndefined();

    const database = await requireOwnerDatabase();
    execFileSync("npm", ["run", "db:migrate"], {
      env: {
        ...process.env,
        DATABASE_URL_OWNER: ownerDatabaseUrl
      },
      stdio: "pipe"
    });
    execFileSync("npm", ["run", "db:migrate"], {
      env: {
        ...process.env,
        DATABASE_URL_OWNER: ownerDatabaseUrl
      },
      stdio: "pipe"
    });
    const result = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "_prisma_migrations"
        WHERE migration_name = '0001_identity' AND finished_at IS NOT NULL`
    );
    expect(result.rows[0]?.count).toBe("1");
  });
});
