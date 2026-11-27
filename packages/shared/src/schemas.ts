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
    correlation_id: z.uuid(),
    current_total: z.string().optional(),
    product_ids: z.array(z.uuid()).optional()
  })
});

/** Decimal string in PKR with two places, as returned by the API. */
export const MoneySchema = z.string().regex(/^[0-9]{1,10}\.[0-9]{2}$/);

/** Total shown to the customer; a consent check only, never a price. */
export const ExpectedTotalSchema = z
  .string()
  .regex(/^[0-9]{1,10}(\.[0-9]{1,2})?$/);

export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/);

export const OrderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "PREPARING",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED"
]);

export const MAX_ORDER_LINES = 30;
export const MAX_LINE_QUANTITY = 20;

/**
 * Unknown keys (for example a client-supplied price or total) are stripped,
 * so they can never reach pricing code.
 */
export const CreateOrderBodySchema = z.object({
  request_id: z.uuid(),
  expected_total: ExpectedTotalSchema,
  recipient_name: z.string().trim().min(1).max(200),
  phone: PhoneSchema,
  email: z.string().trim().max(320).pipe(z.email()),
  delivery_address: z.string().trim().min(8).max(500),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.int().min(1).max(MAX_LINE_QUANTITY)
      })
    )
    .min(1)
    .max(MAX_ORDER_LINES)
    .refine(
      (items) =>
        new Set(items.map((item) => item.product_id)).size === items.length,
      "Each product may appear on one line only."
    )
});

export const StorefrontProductSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  finish: z.string(),
  dimensions_cm: z.string(),
  dimensions_in: z.string(),
  badge: z.string().nullable(),
  price: MoneySchema,
  availability: z.enum(["AVAILABLE", "OUT_OF_STOCK"]),
  is_held: z.boolean()
});

export const StorefrontProductListSchema = z.object({
  items: z.array(StorefrontProductSchema)
});

export const CustomerOrderItemSchema = z.object({
  product_title: z.string(),
  product_sku: z.string(),
  quantity: z.int(),
  unit_price: MoneySchema,
  line_total: MoneySchema
});

/** Customer-safe order view. Keep in step with the CustomerOrder DTO. */
export const CustomerOrderSchema = z.object({
  order_number: z.string().regex(/^OF-[0-9]{6,}$/),
  lifecycle_status: OrderStatusSchema,
  created_at: z.string(),
  subtotal_pkr: MoneySchema,
  delivery_charge_pkr: MoneySchema,
  total_pkr: MoneySchema,
  recipient_name: z.string(),
  recipient_phone: z.string(),
  delivery_address: z.string(),
  note: z.string().nullable(),
  items: z.array(CustomerOrderItemSchema)
});

export const CustomerOrderListSchema = z.object({
  items: z.array(CustomerOrderSchema),
  page: z.int(),
  page_size: z.int(),
  total: z.int()
});

export type CreateOrderBody = z.infer<typeof CreateOrderBodySchema>;
export type CustomerOrder = z.infer<typeof CustomerOrderSchema>;
export type StorefrontProduct = z.infer<typeof StorefrontProductSchema>;
