import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import type { AppConfig } from "../src/config.js";
import {
  createPendingLogin,
  OidcIssuerAdapter
} from "../src/modules/auth/oidc-adapter.js";

describe("Slice 1A ID token verification", () => {
  const issuer = "https://issuer.example.test";
  const pending = createPendingLogin("/");
  const tokens = new Map<string, string>();
  let server: Server;
  let adapter: OidcIssuerAdapter;
  let signingKey: KeyLike;

  beforeAll(async () => {
    const [trusted, untrusted] = await Promise.all([
      generateKeyPair("RS256"),
      generateKeyPair("RS256")
    ]);
    signingKey = trusted.privateKey;
    const publicJwk = await exportJWK(trusted.publicKey);
    publicJwk.kid = "test-key";
    publicJwk.use = "sig";
    publicJwk.alg = "RS256";

    server = createServer(async (request, response) => {
      if (request.url === "/.well-known/openid-configuration") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: "http://mock-oidc:4000/auth",
            token_endpoint: "http://mock-oidc:4000/token",
            jwks_uri: "http://mock-oidc:4000/jwks"
          })
        );
        return;
      }
      if (request.url === "/jwks") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }
      if (request.url === "/token" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk.toString();
        const code = new URLSearchParams(body).get("code");
        const idToken = code ? tokens.get(code) : undefined;
        if (!idToken) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end("{}");
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id_token: idToken }));
        return;
      }
      response.writeHead(404);
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test OIDC issuer did not bind to a TCP port.");
    }

    const config: AppConfig = {
      NODE_ENV: "test",
      API_PORT: 3000,
      DATABASE_URL: "postgresql://test:test@localhost:5432/orderflow_test",
      WEB_ORIGIN: "http://localhost:5173",
      OIDC_ISSUER_URL: issuer,
      OIDC_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      OIDC_CLIENT_ID: "orderflow-test-client",
      OIDC_CLIENT_SECRET: "test-client-secret",
      OIDC_REDIRECT_URI: "http://localhost:3000/api/v1/auth/oidc/callback",
      OIDC_SCOPES: "openid profile email",
      SESSION_SECRET: "test-session-secret-with-sufficient-length",
      SESSION_COOKIE_SECURE: false
    };
    adapter = new OidcIssuerAdapter(config);

    const expired = await signIdToken(signingKey, {
      exp: Math.floor(Date.now() / 1000) - 60
    });
    const wrongAudience = await signIdToken(signingKey, {
      aud: "another-client"
    });
    const wrongIssuer = await signIdToken(signingKey, {
      iss: "https://wrong-issuer.example.test"
    });
    const badSignature = await signIdToken(untrusted.privateKey);
    tokens.set("expired", expired);
    tokens.set("wrong-audience", wrongAudience);
    tokens.set("wrong-issuer", wrongIssuer);
    tokens.set("bad-signature", badSignature);
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("uses the public issuer for browser authorization URLs", async () => {
    const url = await adapter.createAuthorizationUrl(pending);
    expect(url.origin).toBe(issuer);
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("portal")).toBe("customer");
    expect(url.searchParams.get("mode")).toBeNull();
    expect(JSON.parse(url.searchParams.get("claims") ?? "{}")).toEqual({
      id_token: {
        name: { essential: true },
        email: { essential: true }
      }
    });
  });

  it.each(["sign-in", "sign-up"] as const)(
    "forwards customer %s mode to the issuer",
    async (mode) => {
      const login = createPendingLogin("/", "customer", mode);
      const url = await adapter.createAuthorizationUrl(login);
      expect(url.searchParams.get("portal")).toBe("customer");
      expect(url.searchParams.get("mode")).toBe(mode);
    }
  );

  it.each([
    ["expired", "expired"],
    ["wrong audience", "wrong-audience"],
    ["wrong issuer", "wrong-issuer"],
    ["bad signature", "bad-signature"]
  ])("1A-11 rejects an ID token with %s", async (_description, code) => {
    await expect(
      adapter.verifyAuthorizationCode(code, pending)
    ).rejects.toMatchObject({ code: "INVALID_ID_TOKEN" });
  });

  async function signIdToken(
    key: KeyLike,
    overrides: { aud?: string; exp?: number; iss?: string } = {}
  ): Promise<string> {
    return new SignJWT({
      email: "token-test@example.test",
      name: "Token Test",
      nonce: pending.nonce
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(overrides.iss ?? issuer)
      .setAudience(overrides.aud ?? "orderflow-test-client")
      .setSubject("token-test-subject")
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? "5m")
      .sign(key);
  }
});
