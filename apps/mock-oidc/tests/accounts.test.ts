import { describe, expect, it } from "vitest";
import {
  accountsForPortal,
  createPresetAccounts,
  parsePortal,
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
  const accounts = createPresetAccounts("demo-owner");
  accounts.set("customer-new", {
    subject: "customer-new",
    name: "Newly Created",
    email: "new@example.test",
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
  it("offers only customers, including newly created ones, to the customer portal", () => {
    const names = accountsForPortal(allAccounts().values(), "customer").map(
      (account) => account.name
    );
    expect(names).toEqual(["Customer A", "Customer B", "Newly Created"]);
  });

  it("offers staff and the seeded customers, but not new customers, to the staff portal", () => {
    const names = accountsForPortal(allAccounts().values(), "staff").map(
      (account) => account.name
    );
    expect(names).toEqual([...staffNames, "Customer A", "Customer B"]);
  });

  it("rejects staff subjects for the customer portal", () => {
    const subjects = accountsForPortal(allAccounts().values(), "customer").map(
      (account) => account.subject
    );
    expect(subjects).not.toContain("demo-owner");
    expect(subjects).not.toContain("demo-admin");
    expect(subjects).not.toContain("demo-staff-full");
  });
});

describe("login page", () => {
  const render = (portal: "customer" | "staff", mode?: "sign-in" | "sign-up") =>
    renderLoginPage({
      portal,
      accounts: accountsForPortal(allAccounts().values(), portal),
      interactionUrl: "/interaction/abc",
      mode
    });

  it("customer page is branded and never contains staff accounts or wording", () => {
    const html = render("customer");
    expect(html).toContain("Ghar ki Ronak — Customer Account Sign-In");
    expect(html).toContain("#faf8f5");
    expect(html).toContain("#b4532a");
    expect(html).toContain("Create a Customer Account");
    expect(html).toContain('value="demo-customer-a"');
    for (const name of staffNames) expect(html).not.toContain(name);
    expect(html).not.toMatch(
      /owner|admin|staff|picker|inspector|operations|internal/i
    );
  });

  it("shows only the demo sign-in form in customer sign-in mode", () => {
    const html = render("customer", "sign-in");
    expect(html).toContain('id="account_id"');
    expect(html).toContain('id="password"');
    expect(html).not.toContain("Create a Customer Account");
    expect(html).not.toContain('id="new-name"');
  });

  it("shows only the account-creation form in customer sign-up mode", () => {
    const html = render("customer", "sign-up");
    expect(html).toContain("Create a Customer Account");
    expect(html).toContain('id="new-name"');
    expect(html).toContain('id="new-email"');
    expect(html).not.toContain('id="account_id"');
    expect(html).not.toContain('id="password"');
  });

  it("keeps both customer forms visible when mode is omitted", () => {
    const html = render("customer");
    expect(html).toContain('id="account_id"');
    expect(html).toContain('id="new-name"');
  });

  it("staff page is the internal sign-in, lists staff first and offers no sign-up", () => {
    const html = render("staff");
    expect(html).toContain("OrderFlow Operations — Internal Identity Sign-In");
    for (const name of staffNames) expect(html).toContain(name);
    expect(html).toContain("Customer A");
    expect(html).not.toContain("Newly Created");
    expect(html).not.toContain("Create a Customer Account");
    expect(html).not.toContain("create-account");
  });

  it("escapes account names", () => {
    const html = renderLoginPage({
      portal: "customer",
      accounts: [
        {
          subject: "customer-x",
          name: '<script>alert("x")</script>',
          email: "x@example.test",
          kind: "customer",
          preset: false
        }
      ],
      interactionUrl: "/interaction/abc"
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
