import { useSearchParams } from "react-router-dom";
import { buildOidcSignInUrl } from "../model/api-client.js";
import { usePageTitle } from "../controller/page.js";
import { PageFrame } from "./page-frame.js";

/** Public customer portal. It must never mention internal workspaces. */
export function SignInPage() {
  usePageTitle("Sign in · Ghar ki Ronak");
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("return_to"));
  const emailSignInUrl = buildOidcSignInUrl(returnTo, "customer", "sign-in");
  const googleSignInUrl = buildOidcSignInUrl(
    returnTo,
    "customer",
    "sign-in",
    "google"
  );
  const appleSignInUrl = buildOidcSignInUrl(
    returnTo,
    "customer",
    "sign-in",
    "apple"
  );
  const signUpUrl = buildOidcSignInUrl(returnTo, "customer", "sign-up");

  return (
    <PageFrame variant="customer">
      <main className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Welcome</p>
          <h1>Sign in to Ghar ki Ronak</h1>
          <p className="lead">
            Sign in to place and follow your decoration orders, or create a
            customer account in a minute.
          </p>
          <div className="auth-actions">
            <a
              className="button button-primary button-block"
              href={emailSignInUrl}
            >
              Sign in with Email
            </a>
            <a
              className="button button-outline button-block"
              href={googleSignInUrl}
            >
              Continue with Google
            </a>
            <a
              className="button button-outline button-block"
              href={appleSignInUrl}
            >
              Continue with Apple
            </a>
          </div>
          <p className="divider">
            <span>New here?</span>
          </p>
          <a className="button button-outline button-block" href={signUpUrl}>
            Create a Customer Account
          </a>
        </div>
      </main>
    </PageFrame>
  );
}

/** Only same-site paths are accepted; anything else falls back to the root. */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  return value;
}
