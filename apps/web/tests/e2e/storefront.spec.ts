import { expect, test, type Page } from "@playwright/test";

const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const demoPassword = process.env.MOCK_OIDC_DEMO_PASSWORD;
const internalTerms = /admin|owner|staff|operations|workspace/i;

async function signInThroughIssuer(page: Page, email: string): Promise<void> {
  if (!demoPassword)
    throw new Error("MOCK_OIDC_DEMO_PASSWORD is required for browser tests");
  await page.getByRole("link", { name: "Sign in with Email" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function addFirstTwoProducts(page: Page): Promise<void> {
  const cards = page.getByRole("article");
  await cards
    .nth(0)
    .getByRole("button", { name: /Add to bag/ })
    .click();
  await cards
    .nth(1)
    .getByRole("button", { name: /Add to bag/ })
    .click();
}

test("1B-E01 anyone can browse the storefront, filter it and open quick view", async ({
  page
}) => {
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", { name: /Ghar ki Ronak/ }).first()
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(8);
  // Visible text and links only, as in the 1A isolation check.
  await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/orders"]')).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(internalTerms);

  const first = page.getByRole("article").first();
  const title = await first.getByRole("heading").innerText();
  await first.getByRole("button", { name: /Quick view/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  await expect(dialog.getByText(/PKR [0-9,]+\.[0-9]{2}/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("searchbox", { name: /Search/ }).fill(title);
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("searchbox", { name: /Search/ }).fill("");
  await expect(page.getByRole("article")).toHaveCount(8);

  await page.getByRole("button", { name: "in", exact: true }).click();
  await expect(page.getByText(/ in$/).first()).toBeVisible();
});

test("1B-E02 to E06 customer journey: bag, sign-in return, checkout, own orders, isolation", async ({
  page,
  browser
}) => {
  let orderNumber = "";

  await test.step("1B-E02 the bag survives a reload and prices are exact", async () => {
    await page.goto("/shop");
    await addFirstTwoProducts(page);
    await page.reload();
    await page.getByRole("button", { name: /Bag/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "View bag" })
      .click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("cart-total")).toContainText(
      /PKR [0-9,]+\.[0-9]{2}/
    );
  });

  await test.step("1B-E03 anonymous checkout goes to sign-in and returns with the bag intact", async () => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(
      /\/sign-in\?return_to=%2Fcheckout|\/sign-in\?return_to=\/checkout/
    );
    await signInThroughIssuer(page, "customer-a@example.com");
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId("checkout-summary")).toContainText(
      /PKR [0-9,]+\.[0-9]{2}/
    );
  });

  await test.step("1B-E04 checkout explains a changed price and an unavailable product", async () => {
    await page.getByLabel("Full name").fill("Amna Khan");
    await page.getByLabel("Phone").fill("+923001234567");
    await page.getByLabel("Email").fill("amna@example.com");
    await page
      .getByLabel("Delivery address")
      .fill("House 12, Street 4, Gulberg, Lahore");

    await page.route(`${apiBaseUrl}/api/v1/orders`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "PRICE_CHANGED",
            message: "Prices changed.",
            correlation_id: "11111111-1111-4111-8111-111111111111",
            current_total: "4321.00"
          }
        })
      });
    });
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert")).toContainText(/price/i);
    await expect(page.getByRole("alert")).toContainText("4,321.00");
    await page.unroute(`${apiBaseUrl}/api/v1/orders`);

    await page.route(`${apiBaseUrl}/api/v1/orders`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "PRODUCT_UNAVAILABLE",
            message: "Unavailable.",
            correlation_id: "22222222-2222-4222-8222-222222222222",
            product_ids: []
          }
        })
      });
    });
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("alert")).toContainText(/no longer available/i);
    await page.unroute(`${apiBaseUrl}/api/v1/orders`);
  });

  await test.step("1B-E05 placing the order shows it as awaiting payment, once, with a read-only address", async () => {
    // Double click must create a single order.
    await page.getByRole("button", { name: "Place order" }).dblclick();
    await expect(page).toHaveURL(/\/my-orders\/OF-[0-9]{6,}$/);
    orderNumber = page.url().split("/").pop() ?? "";
    await expect(page.getByText("Awaiting payment")).toBeVisible();
    await expect(
      page.getByText("House 12, Street 4, Gulberg, Lahore")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /edit|change/i })
    ).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    await page.goto("/my-orders");
    await expect(page.getByRole("link", { name: orderNumber })).toHaveCount(1);
    // The bag was emptied by the successful order.
    await page.goto("/cart");
    await expect(page.getByText(/bag is empty/i)).toBeVisible();
  });

  await test.step("1B-E06 another customer cannot open this order and sign-out clears the bag", async () => {
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(`/my-orders/${orderNumber}`);
    await expect(other).toHaveURL(/\/sign-in/);
    await signInThroughIssuer(other, "customer-b@example.com");
    await expect(other).toHaveURL(new RegExp(`/my-orders/${orderNumber}$`));
    await expect(other.getByText(/order not found/i)).toBeVisible();
    await expect(other.getByText("House 12")).toHaveCount(0);
    await other.goto("/shop");
    await other
      .getByRole("article")
      .first()
      .getByRole("button", { name: /Add to bag/ })
      .click();
    await other.getByRole("button", { name: "Sign out" }).click();
    await expect(other).toHaveURL(/\/sign-in$/);
    const stored = await other.evaluate(() => window.sessionStorage.length);
    expect(stored).toBe(0);
    await context.close();
  });
});

test("1B-E07 a bag line for a product that is no longer sold is removed", async ({
  page
}) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "orderflow.cart",
      JSON.stringify([
        { product_id: "00000000-0000-4000-8000-000000000000", quantity: 1 }
      ])
    );
  });
  await page.goto("/cart");
  await expect(
    page.getByText(/no longer sold and were removed/i)
  ).toBeVisible();
  await expect(page.getByText(/bag is empty/i)).toBeVisible();
  const stored = await page.evaluate(() => window.sessionStorage.length);
  expect(stored).toBe(0);
});
