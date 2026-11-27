import type { Prisma, PrismaClient } from "@prisma/client";
import { OidcClaimsSchema } from "@orderflow/shared";
import { prisma } from "../../db/prisma.js";
import { createAuditEvent } from "../audit/index.js";
import { DomainError } from "../errors/domain-error.js";

export interface UserIdentity {
  id: string;
  name: string;
  roles: string[];
  permissions: string[];
}

interface ProvisionedUser extends UserIdentity {
  email: string;
}

interface UserWithRoles {
  id: string;
  name: string;
  email: string;
  userRoles: Array<{
    role: {
      id: string;
      rolePermissions: Array<{ permission: { id: string } }>;
    };
  }>;
}

export async function provisionUserFromOidcClaims(
  input: { subject: string; name: string; email: string },
  database: PrismaClient = prisma,
  correlationId = "identity-provisioning"
): Promise<ProvisionedUser> {
  const claims = OidcClaimsSchema.parse(input);
  return database.$transaction(async (transaction) => {
    const insertedUsers = await transaction.$queryRaw<Array<{ id: string }>>`
      INSERT INTO users (oidc_subject, name, email)
      VALUES (${claims.subject}, ${claims.name}, ${claims.email})
      ON CONFLICT (oidc_subject) DO NOTHING
      RETURNING id::text AS id
    `;
    const existingUser =
      insertedUsers[0] ??
      (await transaction.user.findUnique({
        where: { oidcSubject: claims.subject },
        select: { id: true }
      }));
    if (!existingUser) {
      throw new DomainError(
        "IDENTITY_PROVISIONING_FAILED",
        "Could not provision the account.",
        500
      );
    }

    let userRoles = await transaction.userRole.findMany({
      where: { userId: existingUser.id },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } }
        }
      }
    });

    if (userRoles.length === 0) {
      await transaction.userRole.create({
        data: { userId: existingUser.id, roleId: "customer" }
      });
      await createAuditEvent(transaction, {
        eventType: "CUSTOMER_PROVISIONED",
        actorType: "SYSTEM",
        details: { user_id: existingUser.id },
        correlationId
      });
      userRoles = await transaction.userRole.findMany({
        where: { userId: existingUser.id },
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } }
          }
        }
      });
    }

    const identity = toIdentity({
      id: existingUser.id,
      name: claims.name,
      email: claims.email,
      userRoles
    });
    return identity;
  });
}

export async function getUserIdentity(
  userId: string,
  transaction: Prisma.TransactionClient | PrismaClient = prisma
): Promise<UserIdentity | null> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } }
          }
        }
      }
    }
  });
  if (!user) return null;
  return toIdentity(user);
}

export async function assignRole(
  userId: string,
  roleId: string,
  database: PrismaClient = prisma
): Promise<void> {
  await database.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } }
    });
    if (!user)
      throw new DomainError("USER_NOT_FOUND", "User was not found.", 404);

    const role = await transaction.role.findUnique({ where: { id: roleId } });
    if (!role)
      throw new DomainError("ROLE_NOT_FOUND", "Role was not found.", 404);

    const currentRoles = user.userRoles.map((item) => item.role.id);
    const hasCustomerRole = currentRoles.includes("customer");
    const addingCustomer = roleId === "customer";
    if (
      (hasCustomerRole && roleId !== "customer") ||
      (!hasCustomerRole && addingCustomer && currentRoles.length > 0)
    ) {
      throw new DomainError(
        "ROLE_COMBINATION_NOT_ALLOWED",
        "Customer and staff roles cannot be assigned to the same account.",
        409
      );
    }

    await transaction.userRole.createMany({
      data: [{ userId, roleId }],
      skipDuplicates: true
    });
  });
}

function toIdentity(user: UserWithRoles): ProvisionedUser {
  const roles = user.userRoles.map((item) => item.role.id).sort();
  const permissions = [
    ...new Set(
      user.userRoles.flatMap((item) =>
        item.role.rolePermissions.map((grant) => grant.permission.id)
      )
    )
  ].sort();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles,
    permissions
  };
}
