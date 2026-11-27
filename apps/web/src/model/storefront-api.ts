import {
  CsrfTokenSchema,
  CustomerOrderListSchema,
  CustomerOrderSchema,
  StorefrontProductListSchema,
  type CustomerOrder,
  type StorefrontProduct
} from "@orderflow/shared";
import { apiBaseUrl, createApiError } from "./api-client.js";

export interface ApiFailure extends Error {
  status?: number;
  code?: string;
  currentTotal?: string;
  productIds?: string[];
}

export interface OrderSubmission {
  request_id: string;
  expected_total: string;
  recipient_name: string;
  phone: string;
  email: string;
  delivery_address: string;
  note?: string;
  items: Array<{ product_id: string; quantity: number }>;
}

export async function fetchProducts(): Promise<StorefrontProduct[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/storefront/products`);
  if (!response.ok) throw await createApiError(response);
  const payload: unknown = await response.json();
  return StorefrontProductListSchema.parse(payload).items;
}

export async function submitOrder(
  body: OrderSubmission
): Promise<CustomerOrder> {
  const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
    credentials: "include"
  });
  if (!csrfResponse.ok) throw await createApiError(csrfResponse);
  const csrf = CsrfTokenSchema.parse(await csrfResponse.json());
  const response = await fetch(`${apiBaseUrl}/api/v1/orders`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf.csrf_token
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await createApiError(response);
  return CustomerOrderSchema.parse(await response.json());
}

export async function fetchMyOrders(page: number): Promise<{
  items: CustomerOrder[];
  total: number;
  page: number;
  page_size: number;
}> {
  const response = await fetch(
    `${apiBaseUrl}/api/v1/my/orders?page=${page}&page_size=20`,
    { credentials: "include" }
  );
  if (!response.ok) throw await createApiError(response);
  return CustomerOrderListSchema.parse(await response.json());
}

export async function fetchMyOrder(
  orderNumber: string
): Promise<CustomerOrder> {
  const response = await fetch(
    `${apiBaseUrl}/api/v1/my/orders/${encodeURIComponent(orderNumber)}`,
    { credentials: "include" }
  );
  if (!response.ok) throw await createApiError(response);
  return CustomerOrderSchema.parse(await response.json());
}
