import { randomUUID, timingSafeEqual } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response
} from "express";
import Provider from "oidc-provider";
import pino from "pino";
import { z } from "zod";
import {
  CreateAccountSchema,
  createPresetAccounts,
  type MockAccount
} from "./accounts.js";

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
const accounts = createPresetAccounts(environment.BOOTSTRAP_OWNER_SUBJECT);

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
    response
      .type("html")
      .send(
        renderLoginPage(
          [...accounts.values()],
          undefined,
          interactionPath(request.params.uid)
        )
      );
  } catch (error) {
    next(error);
  }
});

app.post("/interaction/:uid/login", async (request, response, next) => {
  try {
    const accountId = readText(request.body.account_id);
    const password = readText(request.body.password);
    const account = accountId ? accounts.get(accountId) : undefined;
    if (
      !account ||
      !passwordMatches(password, environment.MOCK_OIDC_DEMO_PASSWORD)
    ) {
      response
        .status(401)
        .type("html")
        .send(
          renderLoginPage(
            [...accounts.values()],
            "Sign-in failed.",
            interactionPath(request.params.uid)
          )
        );
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
      const parsed = CreateAccountSchema.safeParse({
        name: request.body.name,
        email: request.body.email,
        password: request.body.password
      });
      if (
        !parsed.success ||
        !passwordMatches(
          parsed.data?.password,
          environment.MOCK_OIDC_DEMO_PASSWORD
        )
      ) {
        response
          .status(400)
          .type("html")
          .send(
            renderLoginPage(
              [...accounts.values()],
              "Account details are invalid.",
              interactionPath(request.params.uid)
            )
          );
        return;
      }
      const account: MockAccount = {
        subject: `customer-${randomUUID()}`,
        name: parsed.data.name,
        email: parsed.data.email
      };
      accounts.set(account.subject, account);
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

function passwordMatches(
  supplied: string | undefined,
  expected: string
): boolean {
  if (typeof supplied !== "string") return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function renderLoginPage(
  presets: MockAccount[],
  error?: string,
  interactionUrl = "/interaction"
): string {
  const options = presets
    .map(
      (account) =>
        `<option value="${escapeHtml(account.subject)}">${escapeHtml(account.name)}</option>`
    )
    .join("");
  const errorMessage = error ? `<p role="alert">${escapeHtml(error)}</p>` : "";
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OrderFlow demo sign-in</title></head>
  <body>
    <main>
      <h1>OrderFlow demo sign-in</h1>
      ${errorMessage}
      <form method="post" action="${escapeHtml(`${interactionUrl}/login`)}">
        <label for="account_id">Demo account</label>
        <select id="account_id" name="account_id">${options}</select>
        <label for="password">Demo password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Sign in</button>
      </form>
      <section aria-labelledby="create-account-heading">
        <h2 id="create-account-heading">Create new customer account</h2>
        <form method="post" action="${escapeHtml(`${interactionUrl}/create-account`)}">
          <label for="new-name">Name</label>
          <input id="new-name" name="name" autocomplete="name" required maxlength="200">
          <label for="new-email">Email</label>
          <input id="new-email" name="email" type="email" autocomplete="email" required maxlength="320">
          <label for="new-password">Demo password</label>
          <input id="new-password" name="password" type="password" autocomplete="new-password" required>
          <button type="submit">Create account</button>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

function interactionPath(uid: string): string {
  return `/interaction/${encodeURIComponent(uid)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
