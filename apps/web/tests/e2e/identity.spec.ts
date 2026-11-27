import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const demoPassword = process.env.MOCK_OIDC_DEMO_PASSWORD;
const ownerSubject = process.env.BOOTSTRAP_OWNER_SUBJECT ?? "demo-owner";

const demoAccounts = [
  { subject: ownerSubject, name: "Owner", path: "/orders" },
  { subject: "demo-admin", name: "Admin", path: "/orders" },
  { subject: "demo-staff-picker-packer", name: "Picker", path: "/orders" },
  { subject: "demo-staff-inspector", name: "Inspector", path: "/orders" },
  { subject: "demo-staff-full", name: "Full staff", path: "/orders" },
  { subject: "demo-customer-a", name: "Customer A", path: "/shop" },
  { subject: "demo-customer-b", name: "Customer B", path: "/shop" }
] as const;

const internalTerms = /admin|owner|staff|operations|workspace/i;
const staffAccountNames = [
  "OrderFlow Owner",
  "OrderFlow Admin",
  "Picker Packer",
  "Inspector",
  "Full Staff"
];
const staffAccountSubjects = [
  ownerSubject,
  "demo-admin",
  "demo-staff-picker-packer",
  "demo-staff-inspector",
  "demo-staff-full"
];

for (const account of demoAccounts) {
  test(`1A-01 signs in as ${account.name} and lands in ${account.path}`, async ({
    page
  }) => {
    await signInAs(page, account.subject, portalFor(account.path));
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
  const email = `slice-1a-${randomUUID()}@example.test`;

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Create a Customer Account" }).click();
  await expectIssuerPortal(page, "/sign-in");

  // Hiding staff accounts is not enough: the issuer must also refuse them.
  await page.locator("#account_id").evaluate((select, subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = "forged";
    select.append(option);
  }, "demo-admin");
  await page.getByLabel("Demo account").selectOption("demo-admin");
  await page.locator("#password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Sign-in failed.");
  await expectIssuerPortal(page, "/sign-in");

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.locator("#new-password").fill(demoPassword);
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
});

test("1A-15 uses HttpOnly SameSite cookies and no browser token storage", async ({
  page,
  context
}) => {
  await signInAs(page, "demo-customer-a", "/sign-in");

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
  await signInAs(page, "demo-customer-a", "/admin/sign-in");
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
    "Continue with Google",
    "Continue with Apple",
    "Create a Customer Account"
  ]) {
    await expect(page.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      /portal=customer/
    );
  }
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

async function signInAs(
  page: Page,
  subject: string,
  portal: "/sign-in" | "/admin/sign-in"
): Promise<void> {
  if (!demoPassword)
    throw new Error("MOCK_OIDC_DEMO_PASSWORD is required for browser tests");
  await page.goto(portal);
  await page
    .getByRole("link", {
      name:
        portal === "/sign-in" ? "Continue with Google" : "Sign in to Operations"
    })
    .click();
  await expectIssuerPortal(page, portal);
  await page.getByLabel("Demo account").selectOption(subject);
  await page.locator("#password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(shop|orders|no-access)$/);
}

/** The identity provider page must match the portal that started sign-in. */
async function expectIssuerPortal(
  page: Page,
  portal: "/sign-in" | "/admin/sign-in"
): Promise<void> {
  const accountIds = () =>
    page
      .locator("#account_id option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value)
      );
  if (portal === "/sign-in") {
    await expect(
      page.getByRole("heading", {
        name: "Ghar ki Ronak — Customer Account Sign-In"
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Create a Customer Account" })
    ).toBeVisible();
    const ids = await accountIds();
    expect(ids).toEqual(
      expect.arrayContaining(["demo-customer-a", "demo-customer-b"])
    );
    for (const subject of staffAccountSubjects)
      expect(ids).not.toContain(subject);
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
  expect(await accountIds()).toEqual(
    expect.arrayContaining([...staffAccountSubjects, "demo-customer-a"])
  );
}
