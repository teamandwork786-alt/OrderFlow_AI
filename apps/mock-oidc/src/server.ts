import { randomUUID } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response
} from "express";
import Provider from "oidc-provider";
import pino from "pino";
import { z } from "zod";
import {
  accountsForPortal,
  CreateAccountSchema,
  createPresetAccounts,
  passwordMatches,
  parsePortal,
  registerCustomerAccount,
  type MockAccount,
  type Portal
} from "./accounts.js";
import { renderLoginPage, type LoginMode } from "./login-page.js";

const EnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  MOCK_OIDC_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MOCK_OIDC_ISSUER_URL: z.url(),
  MOCK_OIDC_DEMO_PASSWORD: z.string().min(1),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.url(),
  OIDC_COOKIE_SECRET: z.string().min(32),
  BOOTSTRAP_OWNER_SUBJECT: z.string().min(1).default("demo-owner")
});
const environment = EnvironmentSchema.parse(process.env);
const logger = pino({
  level: environment.NODE_ENV === "test" ? "silent" : "info"
});
const accounts = createPresetAccounts(
  environment.BOOTSTRAP_OWNER_SUBJECT,
  environment.MOCK_OIDC_DEMO_PASSWORD
);
const LoginModeSchema = z.enum(["sign-in", "sign-up"]);

const provider = new Provider(environment.MOCK_OIDC_ISSUER_URL, {
  clients: [
    {
      client_id: environment.OIDC_CLIENT_ID,
      client_secret: environment.OIDC_CLIENT_SECRET,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      redirect_uris: [environment.OIDC_REDIRECT_URI],
      token_endpoint_auth_method: "client_secret_basic"
    }
  ],
  extraParams: ["portal", "mode"],
  claims: {
    openid: ["sub"],
    profile: ["name"],
    email: ["email", "email_verified"]
  },
  features: {
    devInteractions: { enabled: false },
    claimsParameter: { enabled: true }
  },
  interactions: {
    url: (_context, interaction) => `/interaction/${interaction.uid}`
  },
  findAccount: async (_context, subject) => {
    const account = accounts.get(subject);
    if (!account) return undefined;
    return {
      accountId: account.subject,
      async claims() {
        return {
          sub: account.subject,
          name: account.name,
          email: account.email,
          email_verified: true
        };
      }
    };
  },
  pkce: { required: () => true },
  cookies: { keys: [environment.OIDC_COOKIE_SECRET] }
});

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/interaction/:uid", async (request, response, next) => {
  try {
    const interaction = await provider.interactionDetails(request, response);
    if (interaction.prompt.name === "consent") {
      const accountId = interaction.session?.accountId;
      const clientId = interaction.params.client_id;
      if (!accountId || typeof clientId !== "string") {
        throw new Error(
          "Consent interaction is missing its account or client."
        );
      }

      const grant = interaction.grantId
        ? await provider.Grant.find(interaction.grantId)
        : new provider.Grant({ accountId, clientId });
      if (!grant) throw new Error("Consent grant was not found.");

      const { missingOIDCScope, missingOIDCClaims } =
        interaction.prompt.details;
      if (missingOIDCScope) {
        grant.addOIDCScope(missingOIDCScope.join(" "));
      }
      if (missingOIDCClaims) {
        grant.addOIDCClaims(missingOIDCClaims);
      }

      const grantId = await grant.save();
      await provider.interactionFinished(request, response, {
        consent: { grantId }
      });
      return;
    }
    const portal = parsePortal(interaction.params.portal);
    const mode = parseLoginMode(interaction.params.mode);
    response.type("html").send(
      renderLoginPage({
        portal,
        accounts: accountsForPortal(accounts.values(), portal),
        interactionUrl: interactionPath(request.params.uid),
        mode
      })
    );
  } catch (error) {
    next(error);
  }
});

app.post("/interaction/:uid/login", async (request, response, next) => {
  try {
    const { portal, mode } = await loginContext(request, response);
    const accountId = readText(request.body.account_id);
    const password = readText(request.body.password);
    // The portal decides which accounts may sign in, not only which are listed.
    const account = accountsForPortal(accounts.values(), portal).find(
      (candidate) => candidate.subject === accountId
    );
    if (!account || !passwordMatches(password, account.password)) {
      sendLoginPage(request, response, portal, mode, "Sign-in failed.", 401);
      return;
    }
    await finishLogin(request, response, account);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/interaction/:uid/create-account",
  async (request, response, next) => {
    try {
      const { portal, mode } = await loginContext(request, response);
      const parsed = CreateAccountSchema.safeParse({
        name: request.body.name,
        email: request.body.email,
        password: request.body.password
      });
      if (portal !== "customer" || mode === "sign-in" || !parsed.success) {
        sendLoginPage(
          request,
          response,
          portal,
          mode,
          "Account details are invalid.",
          400
        );
        return;
      }
      const account = registerCustomerAccount(
        accounts,
        `customer-${randomUUID()}`,
        parsed.data
      );
      if (!account) {
        sendLoginPage(
          request,
          response,
          portal,
          mode,
          "Account details are invalid.",
          400
        );
        return;
      }
      await finishLogin(request, response, account);
    } catch (error) {
      next(error);
    }
  }
);

const oidcCallback = provider.callback();
app.use((request, response) => {
  oidcCallback(request, response);
});

const errorHandler: ErrorRequestHandler = (
  _error: unknown,
  _request,
  response,
  next
) => {
  void next;
  logger.error({ status: 500 }, "mock OIDC request failed");
  if (!response.headersSent)
    response
      .status(500)
      .send("The demo identity provider could not complete the request.");
};
app.use(errorHandler);

app.listen(environment.MOCK_OIDC_PORT, "0.0.0.0", () => {
  logger.info(
    { port: environment.MOCK_OIDC_PORT },
    "mock OIDC issuer listening"
  );
});

async function finishLogin(
  request: Request,
  response: Response,
  account: MockAccount
): Promise<void> {
  await provider.interactionFinished(
    request,
    response,
    { login: { accountId: account.subject } },
    { mergeWithLastSubmission: false }
  );
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function loginContext(
  request: Request,
  response: Response
): Promise<{ portal: Portal; mode?: LoginMode }> {
  const interaction = await provider.interactionDetails(request, response);
  const portal = parsePortal(interaction.params.portal);
  const mode = parseLoginMode(interaction.params.mode);
  return { portal, ...(mode ? { mode } : {}) };
}

function sendLoginPage(
  request: Request,
  response: Response,
  portal: Portal,
  mode: LoginMode | undefined,
  error: string,
  status: number
): void {
  response
    .status(status)
    .type("html")
    .send(
      renderLoginPage({
        portal,
        accounts: accountsForPortal(accounts.values(), portal),
        interactionUrl: interactionPath(String(request.params.uid)),
        mode,
        error
      })
    );
}

function parseLoginMode(value: unknown): LoginMode | undefined {
  const parsed = LoginModeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function interactionPath(uid: string): string {
  return `/interaction/${encodeURIComponent(uid)}`;
}
