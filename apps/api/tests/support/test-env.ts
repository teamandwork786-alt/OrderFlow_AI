import { randomBytes } from "node:crypto";

const appDatabaseUrl = process.env.IDENTITY_TEST_DATABASE_APP_URL;
if (!appDatabaseUrl) {
  throw new Error(
    "IDENTITY_TEST_DATABASE_APP_URL must point to an isolated database migrated with 0001_identity"
  );
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = appDatabaseUrl;
process.env.WEB_ORIGIN ??= "http://localhost:5173";
process.env.OIDC_ISSUER_URL ??= "http://localhost:4000";
process.env.OIDC_INTERNAL_URL ??= "http://localhost:4000";
process.env.OIDC_CLIENT_ID ??= "orderflow-test-client";
process.env.OIDC_CLIENT_SECRET ??= randomBytes(32).toString("base64url");
process.env.OIDC_REDIRECT_URI ??=
  "http://localhost:3000/api/v1/auth/oidc/callback";
process.env.OIDC_SCOPES ??= "openid profile email";
process.env.SESSION_SECRET ??= randomBytes(32).toString("base64url");
process.env.SESSION_COOKIE_SECURE ??= "false";
