import { buildOidcSignInUrl } from "../model/api-client.js";
import { usePageTitle } from "../controller/page.js";
import { PageFrame } from "./page-frame.js";

/** Public customer portal. It must never mention internal workspaces. */
export function SignInPage() {
  usePageTitle("Sign in · Ghar ki Ronak");
  const signInUrl = buildOidcSignInUrl("/", "customer");

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
            <a className="button button-outline button-block" href={signInUrl}>
              Continue with Google
            </a>
            <a className="button button-outline button-block" href={signInUrl}>
              Continue with Apple
            </a>
          </div>
          <p className="divider">
            <span>New here?</span>
          </p>
          <a className="button button-primary button-block" href={signInUrl}>
            Create a Customer Account
          </a>
        </div>
      </main>
    </PageFrame>
  );
}
