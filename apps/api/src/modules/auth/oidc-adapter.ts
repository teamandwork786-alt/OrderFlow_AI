import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { OidcClaimsSchema } from "@orderflow/shared";
import { ZodError } from "zod";
import type { AppConfig } from "../../config.js";
import { DomainError } from "../errors/domain-error.js";
import { logger } from "../../observability/logger.js";

interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface TokenResponse {
  id_token: string;
}

export type SignInPortal = "customer" | "staff";
export type SignInMode = "sign-in" | "sign-up";

export interface OidcLoginRequest {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  portal: SignInPortal;
  mode?: SignInMode;
}

export interface OidcPendingLogin extends OidcLoginRequest {
  expiresAt: number;
}

export class OidcIssuerAdapter {
  private metadataPromise: Promise<OidcMetadata> | undefined;
  private jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(private readonly config: AppConfig) {}

  async createAuthorizationUrl(request: OidcLoginRequest): Promise<URL> {
    const metadata = await this.getMetadata();
    const url = rebaseEndpoint(
      metadata.authorization_endpoint,
      this.config.OIDC_ISSUER_URL
    );
    const params = new URLSearchParams({
      client_id: this.config.OIDC_CLIENT_ID,
      redirect_uri: this.config.OIDC_REDIRECT_URI,
      response_type: "code",
      prompt: "login",
      scope: this.config.OIDC_SCOPES,
      claims: JSON.stringify({
        id_token: {
          name: { essential: true },
          email: { essential: true }
        }
      }),
      state: request.state,
      nonce: request.nonce,
      code_challenge: createHash("sha256")
        .update(request.codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
      portal: request.portal
    });
    if (request.mode) params.set("mode", request.mode);
    url.search = params.toString();
    return url;
  }

  async verifyAuthorizationCode(
    code: string,
    pending: OidcPendingLogin
  ): Promise<{
    subject: string;
    name: string;
    email: string;
  }> {
    let tokenClaimFields: string[] = [];
    try {
      const metadata = await this.getMetadata();
      const tokenEndpoint = rebaseEndpoint(
        metadata.token_endpoint,
        this.config.OIDC_INTERNAL_URL
      );
      const basicAuth = Buffer.from(
        `${this.config.OIDC_CLIENT_ID}:${this.config.OIDC_CLIENT_SECRET}`
      ).toString("base64");
      let response: Response;
      try {
        response = await fetch(tokenEndpoint, {
          method: "POST",
          headers: {
            authorization: `Basic ${basicAuth}`,
            "content-type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: this.config.OIDC_REDIRECT_URI,
            code_verifier: pending.codeVerifier
          }),
          signal: AbortSignal.timeout(5000)
        });
      } catch {
        throw new DomainError(
          "OIDC_UNAVAILABLE",
          "The identity provider is unavailable.",
          503
        );
      }
      if (!response.ok) {
        throw new DomainError(
          "INVALID_ID_TOKEN",
          "The identity provider response could not be verified.",
          401
        );
      }

      const token = parseTokenResponse(await response.json());
      this.jwks ??= createRemoteJWKSet(
        rebaseEndpoint(metadata.jwks_uri, this.config.OIDC_INTERNAL_URL),
        {
          timeoutDuration: 5000
        }
      );
      const verified = await jwtVerify(token.id_token, this.jwks, {
        issuer: this.config.OIDC_ISSUER_URL,
        audience: this.config.OIDC_CLIENT_ID,
        algorithms: ["RS256"]
      });
      tokenClaimFields = Object.keys(verified.payload).sort();
      if (verified.payload.nonce !== pending.nonce) {
        throw new Error("ID token nonce mismatch");
      }
      const claims = OidcClaimsSchema.parse({
        subject: verified.payload.sub,
        name: verified.payload.name,
        email: verified.payload.email
      });
      return claims;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      logger.warn(
        {
          error_name: error instanceof Error ? error.name : "UnknownError",
          invalid_claim_fields:
            error instanceof ZodError
              ? [...new Set(error.issues.map((issue) => issue.path.join(".")))]
              : undefined,
          token_claim_fields: tokenClaimFields
        },
        "OIDC identity response rejected"
      );
      throw new DomainError(
        "INVALID_ID_TOKEN",
        "The identity provider response could not be verified.",
        401
      );
    }
  }

  private getMetadata(): Promise<OidcMetadata> {
    this.metadataPromise ??= (async () => {
      const discoveryUrl = new URL(
        "/.well-known/openid-configuration",
        this.config.OIDC_INTERNAL_URL
      );
      let response: Response;
      try {
        response = await fetch(discoveryUrl, {
          signal: AbortSignal.timeout(5000)
        });
      } catch {
        throw new DomainError(
          "OIDC_UNAVAILABLE",
          "The identity provider is unavailable.",
          503
        );
      }
      if (!response.ok) {
        throw new DomainError(
          "OIDC_UNAVAILABLE",
          "The identity provider is unavailable.",
          503
        );
      }
      const metadata = parseMetadata(await response.json());
      if (metadata.issuer !== this.config.OIDC_ISSUER_URL) {
        throw new DomainError(
          "OIDC_UNAVAILABLE",
          "The identity provider configuration is invalid.",
          503
        );
      }
      return metadata;
    })();
    return this.metadataPromise;
  }
}

function rebaseEndpoint(endpoint: string, internalOrigin: string): URL {
  const parsed = new URL(endpoint);
  return new URL(`${parsed.pathname}${parsed.search}`, internalOrigin);
}

export function createPendingLogin(
  returnTo: string,
  portal: SignInPortal = "customer",
  mode?: SignInMode
): OidcPendingLogin {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(32).toString("base64url"),
    returnTo,
    portal,
    ...(mode ? { mode } : {}),
    expiresAt: Date.now() + 5 * 60 * 1000
  };
}

function parseMetadata(value: unknown): OidcMetadata {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid OIDC metadata");
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.issuer !== "string" ||
    typeof metadata.authorization_endpoint !== "string" ||
    typeof metadata.token_endpoint !== "string" ||
    typeof metadata.jwks_uri !== "string"
  ) {
    throw new Error("Invalid OIDC metadata");
  }
  return {
    issuer: metadata.issuer,
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    jwks_uri: metadata.jwks_uri
  };
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid token response");
  const token = (value as Record<string, unknown>).id_token;
  if (typeof token !== "string" || token.length === 0)
    throw new Error("Missing ID token");
  return { id_token: token };
}
