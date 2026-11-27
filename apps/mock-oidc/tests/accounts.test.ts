import { describe, expect, it } from "vitest";
import {
  accountsForPortal,
  CreateAccountSchema,
  accountForEmail,
  createPresetAccounts,
  hasAccountConflict,
  passwordMatches,
  parsePortal,
  providerAccountForLoginHint,
  registerCustomerAccount,
  type MockAccount
} from "../src/accounts.js";
import { renderLoginPage } from "../src/login-page.js";

const staffNames = [
  "OrderFlow Owner",
  "OrderFlow Admin",
  "Picker Packer",
  "Inspector",
  "Full Staff"
];

function allAccounts(): Map<string, MockAccount> {
  const accounts = createPresetAccounts("demo-owner", "demo-password");
  accounts.set("customer-new", {
    subject: "customer-new",
    name: "Newly Created",
    email: "new@example.test",
    password: "custom-password",
    kind: "customer",
    preset: false
  });
  return accounts;
}

describe("portal parsing", () => {
  it("only treats the exact value 'staff' as the staff portal", () => {
    expect(parsePortal("staff")).toBe("staff");
    for (const value of [
      "customer",
      "STAFF",
      "admin",
      "",
      undefined,
      null,
      ["staff"],
      42
    ]) {
      expect(parsePortal(value)).toBe("customer");
    }
  });
});

describe("accounts offered per portal", () => {
  it("initializes every seeded account with the configured demo password", () => {
    const accounts = createPresetAccounts("demo-owner", "demo-password");
    expect(
      [...accounts.values()].every(
        (account) => account.password === "demo-password"
      )
    ).toBe(true);
  });

  it("accepts only customers, including newly created ones, in the customer portal", () => {
    const names = accountsForPortal(allAccounts().values(), "customer").map(
      (account) => account.name
    );
    expect(names).toEqual([
      "Customer A",
      "Customer B",
      "Google Customer",
      "Apple Customer",
      "Newly Created"
    ]);
  });

  it("accepts staff and seeded customers, but not new customers, in the staff portal", () => {
    const names = accountsForPortal(allAccounts().values(), "staff").map(
      (account) => account.name
    );
    expect(names).toEqual([
      ...staffNames,
      "Customer A",
      "Customer B",
      "Google Customer",
      "Apple Customer"
    ]);
  });

  it("rejects staff subjects for the customer portal", () => {
    const subjects = accountsForPortal(allAccounts().values(), "customer").map(
      (account) => account.subject
    );
    expect(subjects).not.toContain("demo-owner");
    expect(subjects).not.toContain("demo-admin");
    expect(subjects).not.toContain("demo-staff-full");
  });

  it("finds seeded accounts by email without case sensitivity", () => {
    const accounts = allAccounts();
    expect(
      accountForEmail(accounts.values(), "customer-a@example.com", "customer")
        ?.subject
    ).toBe("demo-customer-a");
    expect(
      accountForEmail(accounts.values(), "OWNER@example.com", "staff")?.subject
    ).toBe("demo-owner");
    expect(
      accountForEmail(accounts.values(), "owner@example.com", "customer")
    ).toBeUndefined();
  });

  it.each([
    [
      "google",
      "google-customer",
      "Google Customer",
      "google.customer@example.com"
    ],
    ["apple", "apple-customer", "Apple Customer", "apple.customer@example.com"]
  ] as const)(
    "provides the fixed %s customer identity for automatic OIDC login",
    (provider, subject, name, email) => {
      const account = providerAccountForLoginHint(
        allAccounts().values(),
        "customer",
        provider
      );
      expect(account).toMatchObject({
        subject,
        name,
        email,
        kind: "customer"
      });
      expect(
        providerAccountForLoginHint(allAccounts().values(), "staff", provider)
      ).toBeUndefined();
    }
  );
});

describe("customer account registration", () => {
  it("requires a password with at least six characters", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "New Customer",
        email: "new@example.test",
        password: "secret"
      }).success
    ).toBe(true);
    expect(
      CreateAccountSchema.safeParse({
        name: "New Customer",
        email: "new@example.test",
        password: "short"
      }).success
    ).toBe(false);
    expect(
      CreateAccountSchema.safeParse({
        name: "New Customer",
        email: "new@example.test",
        password: ""
      }).success
    ).toBe(false);
  });

  it("rejects duplicate names and emails without case sensitivity", () => {
    const accounts = [...allAccounts().values()];
    expect(
      hasAccountConflict(accounts, "customer a", "other@example.test")
    ).toBe(true);
    expect(
      hasAccountConflict(accounts, "Other Name", "CUSTOMER-A@example.com")
    ).toBe(true);
    expect(
      hasAccountConflict(accounts, "Other Name", "fresh@example.test")
    ).toBe(false);
  });

  it("stores a newly chosen password and matches only that account password", () => {
    const accounts = createPresetAccounts("demo-owner", "demo-password");
    const details = CreateAccountSchema.parse({
      name: "New Customer",
      email: "new@example.test",
      password: "custom-password"
    });
    const account = registerCustomerAccount(accounts, "customer-new", details);

    expect(account?.password).toBe("custom-password");
    expect(passwordMatches("custom-password", account?.password ?? "")).toBe(
      true
    );
    expect(passwordMatches("demo-password", account?.password ?? "")).toBe(
      false
    );
    expect(
      passwordMatches(
        "demo-password",
        accounts.get("demo-customer-a")?.password ?? ""
      )
    ).toBe(true);
  });
});

describe("login page", () => {
  const render = (portal: "customer" | "staff", mode?: "sign-in" | "sign-up") =>
    renderLoginPage({
      portal,
      interactionUrl: "/interaction/abc",
      mode
    });

  it("customer page is branded and never contains staff accounts or wording", () => {
    const html = render("customer");
    expect(html).toContain("Ghar ki Ronak — Customer Account Sign-In");
    expect(html).toContain("#faf8f5");
    expect(html).toContain("#b4532a");
    expect(html).toContain("Create a Customer Account");
    expect(html).toContain(
      'type="email" name="email" autocomplete="email" required'
    );
    expect(html).not.toContain("<select");
    expect(html).not.toContain("customer-a@example.com");
    for (const name of staffNames) expect(html).not.toContain(name);
    expect(html).not.toMatch(
      /owner|admin|staff|picker|inspector|operations|internal/i
    );
  });

  it("shows only email and password fields in customer sign-in mode", () => {
    const html = render("customer", "sign-in");
    expect(html).toContain('<label for="email">Email</label>');
    expect(html).toContain('id="email" type="email" name="email"');
    expect(html).toContain('<label for="password">Password</label>');
    expect(html).not.toContain("Create a Customer Account");
    expect(html).not.toContain('id="new-name"');
    expect(html).not.toContain("<select");
  });

  it("shows only the account-creation form in customer sign-up mode", () => {
    const html = render("customer", "sign-up");
    expect(html).toContain("Create a Customer Account");
    expect(html).toContain('<label for="new-name">Full Name</label>');
    expect(html).toContain('id="new-email" name="email" type="email"');
    expect(html).toContain('minlength="6"');
    expect(html).not.toContain("<select");
  });

  it("shows email sign-in and sign-up forms when mode is omitted", () => {
    const html = render("customer");
    expect(html).toContain(
      'type="email" name="email" autocomplete="email" required'
    );
    expect(html).toContain('id="new-name"');
    expect(html).not.toContain("<select");
  });

  it("staff page uses email and password without customer sign-up", () => {
    const html = render("staff");
    expect(html).toContain("OrderFlow Operations — Internal Identity Sign-In");
    expect(html).toContain('id="email" type="email" name="email"');
    expect(html).not.toContain("Create a Customer Account");
    expect(html).not.toContain("create-account");
    expect(html).not.toContain("<select");
  });

  it("escapes untrusted error content", () => {
    const html = renderLoginPage({
      portal: "customer",
      interactionUrl: "/interaction/abc",
      error: '<script>alert("x")</script>'
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain('<label for="password">Password</label>');
    expect(html).toContain('<label for="new-password">Password</label>');
    expect(html).not.toContain("Demo password");
  });
});
