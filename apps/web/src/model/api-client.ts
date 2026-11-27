import {
  ApiErrorSchema,
  CsrfTokenSchema,
  CurrentUserSchema
} from "@orderflow/shared";

export interface CurrentUser {
  id: string;
  name: string;
  roles: string[];
  permissions: string[];
  allowed_checklist_steps: number[];
  flags: {
    admin_can_perform_staff_tasks: boolean;
  };
  landing_path: "/shop" | "/orders";
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export type SignInPortal = "customer" | "staff";
export type SignInMode = "sign-in" | "sign-up";

export function buildOidcSignInUrl(
  returnTo: string,
  portal: SignInPortal,
  mode?: SignInMode
): string {
  const url = new URL("/api/v1/auth/oidc/sign-in", apiBaseUrl);
  url.searchParams.set("return_to", returnTo);
  url.searchParams.set("portal", portal);
  if (mode) url.searchParams.set("mode", mode);
  return url.toString();
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetch(`${apiBaseUrl}/api/v1/me`, {
    credentials: "include"
  });
  if (!response.ok) throw await createApiError(response);
  const payload: unknown = await response.json();
  return CurrentUserSchema.parse(payload);
}

export async function signOut(): Promise<void> {
  const csrfResponse = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
    credentials: "include"
  });
  if (!csrfResponse.ok) throw await createApiError(csrfResponse);
  const csrfPayload: unknown = await csrfResponse.json();
  const csrf = CsrfTokenSchema.parse(csrfPayload);
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/sign-out`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": csrf.csrf_token }
  });
  if (!response.ok) throw await createApiError(response);
}

async function createApiError(response: Response): Promise<Error> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new Error("The server returned an invalid response.");
  }
  const parsed = ApiErrorSchema.safeParse(payload);
  const message = parsed.success
    ? parsed.data.error.message
    : "The request could not be completed.";
  return Object.assign(new Error(message), {
    status: response.status,
    code: parsed.success ? parsed.data.error.code : undefined
  });
}
