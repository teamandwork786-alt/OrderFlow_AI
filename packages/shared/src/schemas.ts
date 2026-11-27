import { z } from "zod";

export const OidcClaimsSchema = z.object({
  subject: z.string().min(1).max(255),
  name: z.string().min(1).max(200),
  email: z.email().max(320)
});

export const PermissionKeySchema = z.string().min(1).max(100);

export const SignInQuerySchema = z.object({
  return_to: z.string().max(200).optional()
});

export const OidcCallbackQuerySchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(512)
});

export const CurrentUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(PermissionKeySchema),
  allowed_checklist_steps: z.array(z.int().min(1).max(5)),
  flags: z.object({ admin_can_perform_staff_tasks: z.boolean() }),
  landing_path: z.enum(["/shop", "/orders"])
});

export const CsrfTokenSchema = z.object({ csrf_token: z.string().min(1) });

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlation_id: z.uuid()
  })
});
