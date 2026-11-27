declare module "oidc-provider" {
  export interface OidcInteractionDetails {
    uid: string;
    prompt: {
      name: string;
      details: {
        missingOIDCScope?: string[];
        missingOIDCClaims?: string[];
      };
    };
    grantId?: string;
    params: { client_id: string; portal?: unknown; mode?: unknown };
    session?: { accountId: string } | null;
  }

  export interface OidcGrant {
    addOIDCScope(scope: string): void;
    addOIDCClaims(claims: string[]): void;
    save(): Promise<string>;
  }

  export interface OidcProviderConfiguration {
    clients: Array<{
      client_id: string;
      client_secret: string;
      grant_types: string[];
      response_types: string[];
      redirect_uris: string[];
      token_endpoint_auth_method: string;
    }>;
    claims: Record<string, string[]>;
    extraParams?: string[];
    features: {
      devInteractions: { enabled: boolean };
      claimsParameter: { enabled: boolean };
    };
    interactions: {
      url: (_context: unknown, interaction: { uid: string }) => string;
    };
    findAccount: (
      context: unknown,
      accountId: string
    ) => Promise<
      | {
          accountId: string;
          claims: (
            _use: string,
            _scope: string
          ) => Promise<Record<string, string | boolean>>;
        }
      | undefined
    >;
    pkce: { required: () => boolean };
    cookies: { keys: string[] };
  }

  export default class Provider {
    constructor(issuer: string, configuration: OidcProviderConfiguration);
    callback(): (
      request: import("node:http").IncomingMessage,
      response: import("node:http").ServerResponse
    ) => void;
    interactionDetails(
      request: import("node:http").IncomingMessage,
      response: import("node:http").ServerResponse
    ): Promise<OidcInteractionDetails>;
    interactionFinished(
      request: import("node:http").IncomingMessage,
      response: import("node:http").ServerResponse,
      result: {
        login?: { accountId: string };
        consent?: { grantId: string };
      },
      options?: { mergeWithLastSubmission?: boolean }
    ): Promise<void>;
    readonly Grant: {
      new (options: { accountId: string; clientId: string }): OidcGrant;
      find(id: string): Promise<OidcGrant | undefined>;
    };
  }
}
