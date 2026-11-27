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

for (const account of demoAccounts) {
  test(`1A-01 signs in as ${account.name} and lands in ${account.path}`, async ({
    page
  }) => {
    await signInAs(page, account.subject);
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
  await page.getByRole("link", { name: "Sign in with OrderFlow" }).click();
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
  await signInAs(page, "demo-customer-a");

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
  await signInAs(page, "demo-customer-a");
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
});

async function signInAs(page: Page, subject: string): Promise<void> {
  if (!demoPassword)
    throw new Error("MOCK_OIDC_DEMO_PASSWORD is required for browser tests");
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Sign in with OrderFlow" }).click();
  await page.getByLabel("Demo account").selectOption(subject);
  await page.locator("#password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(shop|orders)$/);
}
