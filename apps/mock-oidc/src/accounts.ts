import { z } from "zod";

export type Portal = "customer" | "staff";

export interface MockAccount {
  subject: string;
  name: string;
  email: string;
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
  email: z.email().max(320),
  password: z.string().min(1).max(200)
});

export function createPresetAccounts(
  ownerSubject: string
): Map<string, MockAccount> {
  const presets: MockAccount[] = [
    {
      subject: ownerSubject,
      name: "OrderFlow Owner",
      email: "owner@example.test",
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-admin",
      name: "OrderFlow Admin",
      email: "admin@example.test",
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-picker-packer",
      name: "Picker Packer",
      email: "picker@example.test",
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-inspector",
      name: "Inspector",
      email: "inspector@example.test",
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-staff-full",
      name: "Full Staff",
      email: "staff@example.test",
      kind: "staff",
      preset: true
    },
    {
      subject: "demo-customer-a",
      name: "Customer A",
      email: "customer-a@example.test",
      kind: "customer",
      preset: true
    },
    {
      subject: "demo-customer-b",
      name: "Customer B",
      email: "customer-b@example.test",
      kind: "customer",
      preset: true
    }
  ];
  return new Map(presets.map((account) => [account.subject, account]));
}
