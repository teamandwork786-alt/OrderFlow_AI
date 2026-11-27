import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

export type Portal = "customer" | "staff";

export interface MockAccount {
  subject: string;
  name: string;
  email: string;
  password: string;
  kind: "customer" | "staff";
  /** Seeded demo account, as opposed to one created through the sign-in page. */
  preset: boolean;
}

/** Missing or unknown values mean the customer portal. */
export function parsePortal(value: unknown): Portal {
  return value === "staff" ? "staff" : "customer";
}

/**
 * Accounts a portal may offer and accept.
 * Customer portal: customer accounts only. Staff portal: staff accounts plus
 * the seeded customers, so the access-denial path can be checked.
 */
export function accountsForPortal(
  accounts: Iterable<MockAccount>,
  portal: Portal
): MockAccount[] {
  return [...accounts].filter((account) =>
    portal === "customer"
      ? account.kind === "customer"
      : account.kind === "staff" || account.preset
  );
}

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().pipe(z.email().max(320)),
  password: z.string().min(6).max(200)
});

export function hasAccountConflict(
  accounts: Iterable<MockAccount>,
  name: string,
  email: string
): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  return [...accounts].some(
    (account) =>
      account.name.trim().toLowerCase() === normalizedName ||
      account.email.trim().toLowerCase() === normalizedEmail
  );
}

export function registerCustomerAccount(
  accounts: Map<string, MockAccount>,
  subject: string,
  details: z.infer<typeof CreateAccountSchema>
): MockAccount | undefined {
  if (hasAccountConflict(accounts.values(), details.name, details.email)) {
    return undefined;
  }
  const account: MockAccount = {
    subject,
    name: details.name,
    email: details.email,
    password: details.password,
    kind: "customer",
    preset: false
  };
  accounts.set(account.subject, account);
  return account;
}

export function passwordMatches(
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

export function createPresetAccounts(
  ownerSubject: string,
  demoPassword: string
): Map<string, MockAccount> {
  const presets: MockAccount[] = [
    {
      subject: ownerSubject,
      name: "OrderFlow Owner",
      email: "owner@example.test",
      password: demoPassword,
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-admin",
      name: "OrderFlow Admin",
      email: "admin@example.test",
      password: demoPassword,
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-picker-packer",
      name: "Picker Packer",
      email: "picker@example.test",
      password: demoPassword,
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-inspector",
      name: "Inspector",
      email: "inspector@example.test",
      password: demoPassword,
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-full",
      name: "Full Staff",
      email: "staff@example.test",
      password: demoPassword,
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-customer-a",
      name: "Customer A",
      email: "customer-a@example.test",
      password: demoPassword,
      kind: "customer",
      preset: true
    },
    {
      subject: "demo-customer-b",
      name: "Customer B",
      email: "customer-b@example.test",
      password: demoPassword,
      kind: "customer",
      preset: true
    }
  ];
  return new Map(presets.map((account) => [account.subject, account]));
}
