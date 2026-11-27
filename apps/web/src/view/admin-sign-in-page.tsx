import { buildOidcSignInUrl } from "../model/api-client.js";
import { useNoIndex, usePageTitle } from "../controller/page.js";
import { PageFrame } from "./page-frame.js";

/**
 * Internal portal, reached only by direct URL. It is never linked from the
 * customer pages. Access is still decided by server-side permissions.
 */
export function AdminSignInPage() {
  usePageTitle("Sign in · OrderFlow Operations");
  useNoIndex();
  const signInUrl = buildOidcSignInUrl("/orders", "staff");

  return (
    <PageFrame variant="operations">
      <main className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Internal use</p>
          <h1>OrderFlow Operations — Staff &amp; Admin Sign-In</h1>
          <p className="lead">
            Sign in with your work account to open the operations workspace.
          </p>
          <a className="button button-primary button-block" href={signInUrl}>
            Sign in to Operations
          </a>
          <p className="hint">
            Access depends on the permissions on your account.
          </p>
        </div>
      </main>
    </PageFrame>
  );
}
