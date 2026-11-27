import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const demoPassword = process.env.MOCK_OIDC_DEMO_PASSWORD;

const demoAccounts = [
  { email: "owner@example.com", name: "Owner", path: "/orders" },
  { email: "admin@example.com", name: "Admin", path: "/orders" },
  { email: "picker@example.com", name: "Picker", path: "/orders" },
  { email: "inspector@example.com", name: "Inspector", path: "/orders" },
  { email: "staff@example.com", name: "Full staff", path: "/orders" },
  { email: "customer-a@example.com", name: "Customer A", path: "/shop" },
  { email: "customer-b@example.com", name: "Customer B", path: "/shop" }
] as const;

const internalTerms = /admin|owner|staff|operations|workspace/i;
const staffAccountNames = [
  "OrderFlow Owner",
  "OrderFlow Admin",
  "Picker Packer",
  "Inspector",
  "Full Staff"
];
for (const account of demoAccounts) {
  test(`1A-01 signs in as ${account.name} and lands in ${account.path}`, async ({
    page
  }) => {
    await signInAs(page, account.email, portalFor(account.path));
    await expect(page).toHaveURL(
      new RegExp(`${account.path.replace("/", "\\/")}$`)
    );
    if (account.path === "/orders") {
      await expect(
        page.getByText("Workspace arrives in a later slice")
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("The storefront arrives in a later slice.")
      ).toBeVisible();
    }

    if (account.path === "/shop") await expectNoInternalReferences(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    const meResponse = await page.request.get(`${apiBaseUrl}/api/v1/me`);
    expect(meResponse.status()).toBe(401);
  });
}

test("1A-02 creates a new OIDC account and provisions the claims as customer", async ({
  page
}) => {
  if (!demoPassword)
    throw new Error("MOCK_OIDC_DEMO_PASSWORD is required for browser tests");
  const name = `New customer ${randomUUID()}`;
  const email = `slice-1a-${randomUUID()}@example.com`;
  const chosenPassword = `Customer-${randomUUID()}`;

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Create a Customer Account" }).click();
  await expectIssuerPortal(page, "/sign-in", "sign-up");

  // Customer sign-in cannot authenticate a staff identity even if forged.
  const interactionUrl = new URL(page.url());
  const forgedLoginResponse = await page.request.post(
    new URL(
      `${interactionUrl.pathname}/login`,
      interactionUrl.origin
    ).toString(),
    { form: { email: "admin@example.com", password: demoPassword } }
  );
  expect(forgedLoginResponse.status()).toBe(401);
  const forgedLoginHtml = await forgedLoginResponse.text();
  expect(forgedLoginHtml).toContain("Sign-in failed.");
  expect(forgedLoginHtml).toContain("Create a Customer Account");
  expect(forgedLoginHtml).not.toContain('id="email"');
  for (const name of staffAccountNames)
    expect(forgedLoginHtml).not.toContain(name);

  await page.getByLabel("Full Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.locator("#new-password").fill(chosenPassword);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
  const meResponse = await page.request.get(`${apiBaseUrl}/api/v1/me`);
  expect(meResponse.status()).toBe(200);
  const me = (await meResponse.json()) as {
    roles: string[];
    landing_path: string;
    name: string;
  };
  expect(me).toMatchObject({
    roles: ["customer"],
    landing_path: "/shop",
    name
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "Sign in with Email" }).click();
  await expectIssuerPortal(page, "/sign-in", "sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(chosenPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible();
});

test("Google and Apple shortcuts create sessions for their fixed customer identities", async ({
  page
}) => {
  for (const provider of [
    { name: "Google", customerName: "Google Customer" },
    { name: "Apple", customerName: "Apple Customer" }
  ]) {
    await page.goto("/sign-in");
    await page
      .getByRole("link", { name: `Continue with ${provider.name}` })
      .click();
    await expect(page).toHaveURL(/\/shop$/);
    await expect(
      page.getByText(`Signed in as ${provider.customerName}`)
    ).toBeVisible();
    const response = await page.request.get(`${apiBaseUrl}/api/v1/me`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      roles: ["customer"],
      landing_path: "/shop",
      name: provider.customerName
    });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("1A-15 uses HttpOnly SameSite cookies and no browser token storage", async ({
  page,
  context
}) => {
  await signInAs(page, "customer-a@example.com", "/sign-in");

  const cookies = await context.cookies(apiBaseUrl);
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === "orderflow_session"
  );
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
  expect(sessionCookie?.secure).toBe(
    process.env.SESSION_COOKIE_SECURE === "true"
  );

  const browserStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage)
  }));
  expect(browserStorage).toEqual({ local: [], session: [] });
  const pageText = await page.locator("body").innerText();
  expect(pageText).not.toMatch(/id_token|access_token|client_secret/i);
});

test("1A-16 shows no-access for a customer opening the staff workspace", async ({
  page
}) => {
  // Signing in through the internal portal grants nothing: access is server-enforced.
  await signInAs(page, "customer-a@example.com", "/admin/sign-in");
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  await expectNoInternalReferences(page);
  await expect(
    page.getByRole("link", { name: "Back to the shop" })
  ).toHaveAttribute("href", "/shop");

  await page.goto("/orders");
  await expect(page).toHaveURL(/\/no-access$/);
  const me = (await (
    await page.request.get(`${apiBaseUrl}/api/v1/me`)
  ).json()) as { roles: string[] };
  expect(me.roles).toEqual(["customer"]);
});

test("1A-21 customer sign-in page offers only customer options and no internal references", async ({
  page
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to Ghar ki Ronak" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Email" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Google" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Apple" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a Customer Account" })
  ).toBeVisible();
  await expectNoInternalReferences(page);
  for (const label of [
    "Sign in with Email",
    "Continue with Google",
    "Continue with Apple"
  ]) {
    const authorizationUrl = authorizationUrlFromLink(
      await page.getByRole("link", { name: label }).getAttribute("href"),
      label
    );
    expect(authorizationUrl.pathname).toBe("/api/v1/auth/oidc/sign-in");
    expect(authorizationUrl.searchParams.get("portal")).toBe("customer");
    expect(authorizationUrl.searchParams.get("mode")).toBe("sign-in");
    expect(authorizationUrl.searchParams.get("provider")).toBe(
      label === "Continue with Google"
        ? "google"
        : label === "Continue with Apple"
          ? "apple"
          : null
    );
  }
  const signUpUrl = authorizationUrlFromLink(
    await page
      .getByRole("link", { name: "Create a Customer Account" })
      .getAttribute("href"),
    "Create a Customer Account"
  );
  expect(signUpUrl.pathname).toBe("/api/v1/auth/oidc/sign-in");
  expect(signUpUrl.searchParams.get("portal")).toBe("customer");
  expect(signUpUrl.searchParams.get("mode")).toBe("sign-up");
});

test("1A-23 the internal portal is a direct, unindexed route that starts sign-in for /orders", async ({
  page
}) => {
  await page.goto("/admin/sign-in");
  await expect(
    page.getByRole("heading", {
      name: "OrderFlow Operations — Staff & Admin Sign-In"
    })
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
  await expect(
    page.getByRole("link", { name: "Sign in to Operations" })
  ).toHaveAttribute("href", /return_to=%2Forders&portal=staff$/);
  await expect(
    page.getByRole("link", { name: "Continue with Google" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue with Apple" })
  ).toHaveCount(0);
});

test("1A-25 an unauthenticated visit to /orders is sent to the internal portal", async ({
  page
}) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

function portalFor(path: "/orders" | "/shop"): "/admin/sign-in" | "/sign-in" {
  return path === "/orders" ? "/admin/sign-in" : "/sign-in";
}

async function expectNoInternalReferences(page: Page): Promise<void> {
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/orders"]')).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(internalTerms);
}

function authorizationUrlFromLink(href: string | null, label: string): URL {
  if (!href) throw new Error(`Missing authorization link for ${label}.`);
  return new URL(href);
}

async function signInAs(
  page: Page,
  email: string,
  portal: "/sign-in" | "/admin/sign-in"
): Promise<void> {
  if (!demoPassword)
    throw new Error("MOCK_OIDC_DEMO_PASSWORD is required for browser tests");
  await page.goto(portal);
  await page
    .getByRole("link", {
      name:
        portal === "/sign-in" ? "Sign in with Email" : "Sign in to Operations"
    })
    .click();
  await expectIssuerPortal(page, portal);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(shop|orders|no-access)$/);
}

/** The identity provider page must match the portal that started sign-in. */
async function expectIssuerPortal(
  page: Page,
  portal: "/sign-in" | "/admin/sign-in",
  mode?: "sign-in" | "sign-up"
): Promise<void> {
  if (portal === "/sign-in") {
    if (mode === "sign-up") {
      await expect(page.locator("#create-account-heading")).toBeVisible();
      await expect(page.locator("#new-name")).toBeVisible();
      await expect(page.locator("#email")).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("heading", {
          name: "Ghar ki Ronak — Customer Account Sign-In"
        })
      ).toBeVisible();
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#new-name")).toHaveCount(0);
    }
    const html = await page.content();
    for (const name of staffAccountNames) expect(html).not.toContain(name);
    expect(html).not.toMatch(/owner|admin|staff|operations|internal/i);
    return;
  }
  await expect(
    page.getByRole("heading", {
      name: "OrderFlow Operations — Internal Identity Sign-In"
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create a Customer Account" })
  ).toHaveCount(0);
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#new-name")).toHaveCount(0);
}
