import { z } from "zod";

export interface MockAccount {
  subject: string;
  name: string;
  email: string;
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
      email: "owner@example.test"
    },
    {
      subject: "demo-admin",
      name: "OrderFlow Admin",
      email: "admin@example.test"
    },
    {
      subject: "demo-staff-picker-packer",
      name: "Picker Packer",
      email: "picker@example.test"
    },
    {
      subject: "demo-staff-inspector",
      name: "Inspector",
      email: "inspector@example.test"
    },
    {
      subject: "demo-staff-full",
      name: "Full Staff",
      email: "staff@example.test"
    },
    {
      subject: "demo-customer-a",
      name: "Customer A",
      email: "customer-a@example.test"
    },
    {
      subject: "demo-customer-b",
      name: "Customer B",
      email: "customer-b@example.test"
    }
  ];
  return new Map(presets.map((account) => [account.subject, account]));
}
